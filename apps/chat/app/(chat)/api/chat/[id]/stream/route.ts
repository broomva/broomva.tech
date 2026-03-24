import {
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { ChatSDKError } from "@/lib/ai/errors";
import type { ChatMessage } from "@/lib/ai/types";
import { getSafeSession } from "@/lib/auth";
import { getChatById, getChatMessageWithPartsById } from "@/lib/db/queries";
import { ArcanClient, resolveArcanUrl } from "@/lib/arcan";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { getStreamContext } from "../../route";

function appendMessageResponse(message: ChatMessage) {
  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      writer.write({
        id: crypto.randomUUID(),
        type: "data-appendMessage",
        data: JSON.stringify(message),
        transient: true,
      });
    },
    generateId: () => message.id,
  });

  return new Response(
    stream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
    { headers: UI_MESSAGE_STREAM_HEADERS }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params;

  // Validate chat ownership
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id || null;

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.visibility !== "public" && chat.userId !== userId) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  // ── Arcan cursor-based replay ───────────────────────────────────
  // If the user has a Life instance, use Lago's event journal for
  // stream reconnection instead of Redis resumable streams.
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (userId && cursor != null) {
    const endpoints = await resolveArcanUrl(userId);
    if (endpoints) {
      try {
        const token = await signLifeJWT({
          id: userId,
          email: session?.user?.email ?? "",
        });
        const client = new ArcanClient(endpoints.arcanUrl, token);
        const sseStream = await client.streamEvents(chatId, {
          cursor: Number(cursor),
          replayLimit: 512,
        });

        return new Response(sseStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        });
      } catch {
        // Arcan unavailable — fall through to Redis path
      }
    }
  }

  // ── Redis resumable stream fallback ─────────────────────────────
  const messageId = request.nextUrl.searchParams.get("messageId");
  if (!messageId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const messageWithParts = await getChatMessageWithPartsById({ id: messageId });
  if (!messageWithParts || messageWithParts.chatId !== chatId) {
    return new ChatSDKError("not_found:stream").toResponse();
  }

  const { message } = messageWithParts;

  // Stream finished — send the finalized message
  if (!message.metadata.activeStreamId) {
    if (message.role !== "assistant") {
      return new Response(null, { status: 204 });
    }
    return appendMessageResponse(message);
  }

  // Resume the existing Redis stream
  const streamContext = await getStreamContext();
  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const stream = await streamContext.resumeExistingStream(
    message.metadata.activeStreamId
  );
  if (!stream) {
    const refreshed = await getChatMessageWithPartsById({ id: messageId });
    if (
      refreshed &&
      refreshed.chatId === chatId &&
      refreshed.message.role === "assistant" &&
      !refreshed.message.metadata.activeStreamId
    ) {
      return appendMessageResponse(refreshed.message);
    }
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
