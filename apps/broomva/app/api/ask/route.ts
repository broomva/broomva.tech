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
import { connection } from "next/server";
import { createModuleLogger } from "@/lib/logger";
import {
  clientIp,
  createLimiter,
  isSameOrigin,
  LIMITS,
  type LimitWindow,
  parseAskBody,
  readBodyCapped,
} from "@/lib/twin/guard";
import { loadTwinKnowledge } from "@/lib/twin/knowledge";
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

const LIMIT_MESSAGES: Record<LimitWindow, string> = {
  "ip-minute": "You're asking faster than I can answer. Try again in a minute.",
  "ip-day":
    "You've reached today's question limit. Come back tomorrow, or write to carlos@broomva.tech.",
  "instance-day":
    "I've answered a lot of questions today and I'm resting. Try again later, or write to carlos@broomva.tech.",
};

/**
 * Grounding health for post-deploy checks: how many public pages the
 * double can retrieve from. 0 means public/agent-knowledge.json did not
 * reach the function, and answers come from the brief alone.
 */
export async function GET() {
  // Evaluate at request time, in the function: with cacheComponents a GET
  // that reads no request data is prerendered at build, where the file
  // always exists, which would hide exactly the failure this reports.
  await connection();
  const knowledge = await loadTwinKnowledge();
  return Response.json({
    ok: true,
    model: MODEL,
    knowledgeDocs: knowledge.documents.length,
    knowledgeGeneratedAt: knowledge.generatedAt,
  });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return json(403, "Forbidden.");

  const limit = limiter.check(clientIp(req.headers));
  if (!limit.ok) {
    return json(429, LIMIT_MESSAGES[limit.window], {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  // Bound the bytes before parsing, while reading: the schema drops unknown
  // fields, but only after JSON.parse has paid for them, and a chunked body
  // carries no Content-Length to check up front.
  const body = await readBodyCapped(req, LIMITS.maxBodyBytes);
  if (!body.ok) {
    return body.reason === "too-large"
      ? json(413, "This conversation is too long. Start a new one.")
      : json(400, "Invalid request body.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return json(400, "Invalid JSON.");
  }
  const parsed = parseAskBody(raw);
  if (!parsed.ok) return json(400, parsed.error);

  const started = Date.now();
  const retrieved = await retrieveForQuestion(parsed.question);
  // Single system string: Claude Haiku 4.5 requires 4,096 tokens before a
  // prompt-cache breakpoint (~2.4K static brief is below threshold), and a
  // single system prompt preserves compatibility with any ASK_MODEL override.
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
          cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
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
