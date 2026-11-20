/**
 * POST /api/ask — "Ask Carlos", the public AI double (BRO-3994).
 *
 * Anonymous and stateless: no session, no database, nothing stored. The
 * client sends the visible thread; the server bounds it (lib/twin/guard),
 * grounds the system prompt in public site content only (lib/twin/persona,
 * lib/twin/retrieve) and streams one answer from a small model through the
 * Vercel AI Gateway. Message text is never logged.
 *
 * Deliberately not under /api/chat: that prefix belongs to the retired
 * ChatJS app and is denied at the Vercel Firewall (BRO-3833).
 */
import { gateway } from "@ai-sdk/gateway";
import { convertToModelMessages, streamText } from "ai";
import { createModuleLogger } from "@/lib/logger";
import {
  clientIp,
  createLimiter,
  isSameOrigin,
  parseAskBody,
} from "@/lib/twin/guard";
import { buildTwinSystemPrompt } from "@/lib/twin/persona";
import { retrieveForQuestion } from "@/lib/twin/retrieve";

export const maxDuration = 30;

const log = createModuleLogger("api:ask");
const limiter = createLimiter();

/** Override with ASK_MODEL (any AI Gateway model id). */
const MODEL = process.env.ASK_MODEL || "anthropic/claude-haiku-4.5";
const MAX_OUTPUT_TOKENS = 700;

function json(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return json(403, "Forbidden.");

  const limit = limiter.check(clientIp(req.headers));
  if (!limit.ok) {
    return json(
      429,
      "You're asking faster than I can answer. Try again in a moment.",
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, "Invalid JSON.");
  }
  const parsed = parseAskBody(raw);
  if (!parsed.ok) return json(400, parsed.error);

  const started = Date.now();
  const retrieved = await retrieveForQuestion(parsed.question);
  const system = buildTwinSystemPrompt({
    retrieved,
    today: new Date().toISOString().slice(0, 10),
  });

  const result = streamText({
    model: gateway(MODEL),
    system,
    messages: await convertToModelMessages(parsed.messages),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onFinish: ({ usage, finishReason }) => {
      log.info(
        {
          model: MODEL,
          turns: parsed.messages.length,
          retrieved: retrieved.map((d) => d.url),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          finishReason,
          ms: Date.now() - started,
        },
        "ask answered",
      );
    },
    onError: ({ error }) => {
      log.error({ err: error, model: MODEL }, "ask stream failed");
    },
  });

  return result.toUIMessageStreamResponse({
    onError: () =>
      "I couldn't answer that just now. Please try again, or write to carlos@broomva.tech.",
  });
}
