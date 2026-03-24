/**
 * Arcan-backed chat execution.
 *
 * Replaces the template's streamText() path when a Life instance is available.
 * The flow:
 *   1. Create or reuse Arcan session (chatId = session_id)
 *   2. POST /sessions/{chatId}/runs with the user's message as objective
 *   3. Pipe the Vercel AI SDK v6 SSE stream back to the client
 *
 * The client's useChat() consumes this natively — no client-side changes needed.
 */

import "server-only";

import { after } from "next/server";
import { ArcanClient, ArcanError } from "./client";
import { createModuleLogger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/ai/types";

const log = createModuleLogger("arcan:execute");

export interface ArcanExecuteOptions {
  chatId: string;
  userMessage: ChatMessage;
  previousMessages: ChatMessage[];
  userId: string;
  arcanUrl: string;
  userEmail: string;
  /** Last known event sequence for cursor-based replay */
  lastSequence?: number;
  abortSignal?: AbortSignal;
}

/**
 * Execute a chat turn via Arcan and return the SSE response.
 *
 * Returns null if Arcan is unreachable (caller should fall back to streamText).
 */
export async function executeViaArcan(
  opts: ArcanExecuteOptions
): Promise<Response | null> {
  const {
    chatId,
    userMessage,
    previousMessages,
    userId,
    arcanUrl,
    userEmail,
    lastSequence,
    abortSignal,
  } = opts;

  let client: ArcanClient;
  try {
    client = await ArcanClient.forUser(arcanUrl, {
      id: userId,
      email: userEmail,
    });
  } catch (e) {
    log.error({ error: e }, "Failed to create Arcan client");
    return null;
  }

  // Health check — bail fast if Arcan is down
  const healthy = await client.health();
  if (!healthy) {
    log.warn({ arcanUrl }, "Arcan unreachable, falling back to streamText");
    return null;
  }

  // Ensure session exists (chatId = session_id, idempotent)
  try {
    const existing = await client.getSession(chatId);
    if (!existing) {
      await client.createSession({
        sessionId: chatId,
        owner: userId,
      });
      log.info({ chatId }, "Created new Arcan session");
    }
  } catch (e) {
    if (e instanceof ArcanError) {
      log.error({ error: e.message, status: e.status }, "Session setup failed");
    }
    return null;
  }

  // Build the objective from the user message content
  const objective = extractObjective(userMessage, previousMessages);

  // Fire the agent run (non-blocking — events stream separately)
  const runPromise = client
    .run(chatId, { objective })
    .catch((e) => {
      log.error({ error: e }, "Arcan run failed");
    });

  // Start streaming events immediately
  // The cursor picks up from where the client last saw events,
  // or 0 for a fresh session
  try {
    const sseStream = await client.streamEvents(
      chatId,
      {
        cursor: lastSequence ?? 0,
        replayLimit: 512,
      },
      abortSignal
    );

    // Ensure the run completes even if the client disconnects
    after(async () => {
      await runPromise;
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        "x-arcan-session-id": chatId,
      },
    });
  } catch (e) {
    if (e instanceof ArcanError) {
      log.error(
        { error: e.message, status: e.status },
        "Failed to open event stream"
      );
    }
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a plain-text objective from the ChatMessage structure.
 * Arcan expects a string objective, not the full message parts.
 */
function extractObjective(
  userMessage: ChatMessage,
  previousMessages: ChatMessage[]
): string {
  // Extract text content from the user message parts
  const textParts = userMessage.parts
    ?.filter((p: { type: string }) => p.type === "text")
    .map((p: { type: string; text?: string }) => p.text ?? "")
    .filter(Boolean);

  if (textParts?.length) {
    return textParts.join("\n\n");
  }

  // Fallback: check for content field (older message format)
  if ("content" in userMessage && typeof userMessage.content === "string") {
    return userMessage.content;
  }

  return "Continue the conversation.";
}
