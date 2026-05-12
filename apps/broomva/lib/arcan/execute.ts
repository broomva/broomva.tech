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
import { generateUUID } from "@/lib/utils";
import type { ChatMessage } from "@/lib/ai/types";

const log = createModuleLogger("arcan:execute");

/** Mirrors aios-protocol's PolicySet — capability strings must use the aios-protocol format */
export interface ArcanPolicySet {
  /** Capabilities allowed without approval. Use aios-protocol format: "fs:read:**", "net:egress:*", "*" */
  allow_capabilities?: string[];
  /** Capabilities requiring human approval before execution */
  gate_capabilities?: string[];
  /** Max wall-clock seconds for a single tool invocation (default: 30) */
  max_tool_runtime_secs?: number;
  /** Max agent events per turn before the run is interrupted (default: 256) */
  max_events_per_turn?: number;
}

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
  /** Tier-based capability policy for the arcand session */
  policy?: ArcanPolicySet;
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
    policy,
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
        policy,
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

  // Fire the agent run (non-blocking — events stream separately).
  // Pass policy on every run so the correct tier policy is enforced even for
  // sessions that were auto-created with PolicySet::default() (owner: "arcan").
  const runPromise = client
    .run(chatId, { objective, policy })
    .catch((e) => {
      log.error({ error: e }, "Arcan run failed");
    });

  // Start streaming events immediately.
  // A fresh UUID per turn ensures each assistant message gets a unique React
  // key — avoids duplicate key warnings when the same session handles multiple
  // turns (previously messageId was always the session_id).
  const messageId = generateUUID();

  try {
    const sseStream = await client.streamEvents(
      chatId,
      {
        cursor: lastSequence ?? 0,
        replayLimit: 512,
        messageId,
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
 * Build the objective string sent to arcand's POST /sessions/{id}/runs.
 *
 * Arcand accepts only a single `objective: string` — no structured messages
 * array. To preserve multi-turn context we encode conversation history into
 * the objective string itself, prefixed before the current user message.
 *
 * Format (XML-tagged so arcand's LLM can cleanly distinguish speakers):
 *
 *   <conversation_history>
 *   User: <text of turn N-k>
 *   Assistant: <text of turn N-k+1>
 *   ...
 *   </conversation_history>
 *
 *   Current request:
 *   <user_message>
 *   <text of current user message>
 *   </user_message>
 *
 * When there is no prior history the <conversation_history> block is omitted
 * so single-turn requests stay compact.
 */
function extractObjective(
  userMessage: ChatMessage,
  previousMessages: ChatMessage[]
): string {
  const currentText = extractMessageText(userMessage);

  // Cap at last 20 messages regardless of what the caller trimmed.
  const history = previousMessages.slice(-20);

  if (history.length === 0) {
    return currentText;
  }

  const historyLines = history
    .map((msg) => {
      const speaker = msg.role === "assistant" ? "Assistant" : "User";
      return `${speaker}: ${extractMessageText(msg)}`;
    })
    .join("\n");

  return (
    `<conversation_history>\n${historyLines}\n</conversation_history>\n\n` +
    `Current request:\n<user_message>\n${currentText}\n</user_message>`
  );
}

/**
 * Extract plain text from a single ChatMessage.
 * Handles UIMessage v6 parts[] and the legacy content string fallback.
 */
function extractMessageText(msg: ChatMessage): string {
  const textParts = msg.parts
    ?.filter((p: { type: string }) => p.type === "text")
    .map((p: { type: string; text?: string }) => p.text ?? "")
    .filter(Boolean);

  if (textParts?.length) {
    return textParts.join("\n\n");
  }

  // Legacy fallback: pre-v6 messages stored in DB with a content string
  if ("content" in msg && typeof (msg as { content?: unknown }).content === "string") {
    return (msg as { content: string }).content;
  }

  return "(empty)";
}
