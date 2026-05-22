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
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";
import { getChatById, getChatMessageWithPartsById } from "@/lib/db/queries";
import { ArcanClient, resolveArcanUrl } from "@/lib/arcan";
import { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import { canonicalToVercelAiSdkSse } from "@/lib/life-runtime/edge-adapter/canonical-to-vercel-ai-sse";
import { getLifegwBaseUrl } from "@/lib/life-runtime/edge-adapter/dispatch-via-lifegw";
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

  // ── Cursor-based replay ─────────────────────────────────────────
  // If the user has a Life-runtime backend (lifegw or per-user Arcan),
  // replay events from the cursor on the canonical event journal.
  //
  // Backend resolution order (M9-F-A migration, BRO-1216):
  //   1. lifegw — when USE_LIFEGW_STREAM_RESUME=1 AND LIFED_GATEWAY_URL is set.
  //      Mints a Tier-1 cap, opens lifed session resumed under the chatId
  //      as the sticky sid, then opens a per-turn stream with
  //      userMessage="" + fromSequence=cursor — pure replay-only mode.
  //   2. Arcan — pre-migration default, kept verbatim. Active when the
  //      lifegw branch is gated off OR yields an error.
  //   3. Redis resumable-stream — the fallback for both, unchanged.
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (userId && cursor != null) {
    const lifegwBaseUrl = getLifegwBaseUrl();
    const lifegwResumeEnabled =
      process.env.USE_LIFEGW_STREAM_RESUME === "1" && !!lifegwBaseUrl;

    if (lifegwResumeEnabled) {
      try {
        const cap = await mintTier1ForConsumer({
          consumer: { kind: "user", id: userId },
          projectSlug: "default",
        });
        const lifegwClient = new LifedWsAgentSessionClient({
          baseUrl: lifegwBaseUrl,
        });
        const lifegwSession = await lifegwClient.createSession({
          capability: { token: cap.token },
          userId,
          projectSlug: "default",
          resumeSid: chatId,
        });
        const events = lifegwClient.stream({
          sessionId: lifegwSession.sid,
          agentId: `user:${userId}`,
          projectSlug: "default",
          userMessage: "",
          history: [],
          kernelCtx: {
            sessionId: lifegwSession.sid,
            agentId: `user:${userId}`,
          },
          capability: {
            token: cap.token,
            expiresAt: cap.expiresAt,
          },
          fromSequence: BigInt(cursor),
        });

        const fallbackTextId = crypto.randomUUID();
        const stream = createUIMessageStream<ChatMessage>({
          execute: async ({ writer }) => {
            for await (const chunk of canonicalToVercelAiSdkSse<ChatMessage>(
              events,
              { fallbackTextId }
            )) {
              writer.write(chunk);
            }
          },
          generateId: () => fallbackTextId,
        });

        return new Response(
          stream
            .pipeThrough(new JsonToSseTransformStream())
            .pipeThrough(new TextEncoderStream()),
          { headers: UI_MESSAGE_STREAM_HEADERS }
        );
      } catch {
        // lifegw unreachable / cap mint failed — fall through to Arcan,
        // then to the Redis path. Same graceful-degradation contract the
        // existing Arcan branch uses below.
      }
    }

    const endpoints = await resolveArcanUrl(userId);
    if (endpoints) {
      try {
        const client = await ArcanClient.forUser(endpoints.arcanUrl, {
          id: userId,
          email: session?.user?.email ?? "",
        });
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
