/**
 * Input validation and abuse limits for POST /api/ask.
 *
 * The endpoint is anonymous and spends model tokens, so every request is
 * bounded before any model call: turn count, message size, total size, and
 * per-IP / per-instance rate windows. Counters are in memory on purpose:
 * the site runs on Fluid compute (instances are reused), Redis is optional
 * and has been unhealthy, and Vercel Bot Protection sits in front. They are
 * per instance, so they slow one client down but do not cap total spend:
 * that needs a shared limit outside the function (a Vercel WAF rate-limit
 * rule on /api/ask and an AI Gateway budget, both dashboard settings).
 */
import { z } from "zod";

export const LIMITS = {
  /** Request body, checked before JSON parsing. */
  maxBodyBytes: 64 * 1024,
  /** Messages accepted in one request (the client sends the whole thread). */
  maxMessages: 24,
  /** Most recent messages forwarded to the model. */
  modelWindow: 10,
  /** What a visitor may type. Rejected above this. */
  maxUserChars: 2_000,
  /**
   * The double's own earlier replies, as echoed back by the client. A
   * 700-token answer can exceed maxUserChars, so these are truncated, never
   * rejected: rejecting them would break the conversation after one long
   * answer.
   */
  maxAssistantChars: 4_000,
  /** Across the window forwarded to the model. */
  maxWindowChars: 16_000,
  perIpPerMinute: 8,
  perIpPerDay: 60,
  perInstancePerDay: 3_000,
} as const;

const textPart = z.object({ type: z.literal("text"), text: z.string() });
const anyPart = z.looseObject({ type: z.string() });

const message = z.object({
  id: z.string().max(200).optional(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(anyPart).max(50),
});

const body = z.object({
  messages: z.array(message).min(1).max(LIMITS.maxMessages),
});

export interface TextMessage {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
}

export type ParseResult =
  | { ok: true; messages: TextMessage[]; question: string }
  | { ok: false; error: string };

/**
 * Keep text parts only (the double has no tools, files or reasoning to
 * replay), enforce the size limits, and require the thread to end on a
 * user turn. Returns the trimmed window that goes to the model.
 */
export function parseAskBody(input: unknown): ParseResult {
  const parsed = body.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request body." };

  const all: TextMessage[] = [];
  for (const [i, m] of parsed.data.messages.entries()) {
    let text = m.parts
      .map((p) => textPart.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data.text)
      .join("")
      .trim();
    if (m.role === "user" && text.length > LIMITS.maxUserChars) {
      return {
        ok: false,
        error: `Questions are limited to ${LIMITS.maxUserChars} characters.`,
      };
    }
    if (m.role === "assistant" && text.length > LIMITS.maxAssistantChars) {
      text = `${text.slice(0, LIMITS.maxAssistantChars)} …`;
    }
    if (!text) continue;
    all.push({
      id: m.id ?? `m${i}`,
      role: m.role,
      parts: [{ type: "text", text }],
    });
  }

  const last = all.at(-1);
  if (last?.role !== "user") {
    return { ok: false, error: "The last message must be a question." };
  }

  // Most recent turns that fit the character budget, starting on a user
  // turn: some providers behind the Gateway (Bedrock Converse) reject a
  // conversation that opens with an assistant message. Older turns are
  // dropped, never rejected, so a long conversation keeps working; the
  // last question alone always fits (maxUserChars < maxWindowChars).
  const window = all.slice(-LIMITS.modelWindow);
  const size = () => window.reduce((n, m) => n + m.parts[0].text.length, 0);
  while (window.length > 1 && size() > LIMITS.maxWindowChars) window.shift();
  while (window[0]?.role === "assistant") window.shift();

  return { ok: true, messages: window, question: last.parts[0].text };
}

interface Window {
  count: number;
  resetAt: number;
}

export type LimitWindow = "ip-minute" | "ip-day" | "instance-day";

export interface Limiter {
  check(
    ip: string,
  ): { ok: true } | { ok: false; window: LimitWindow; retryAfterSec: number };
}

/** Fixed-window counters per key; `now` is injectable for tests. */
export function createLimiter(now: () => number = Date.now): Limiter {
  const windows = new Map<string, Window>();
  let lastSweep = 0;

  function hit(key: string, limit: number, sizeMs: number) {
    const t = now();
    const w = windows.get(key);
    if (!w || w.resetAt <= t) {
      windows.set(key, { count: 1, resetAt: t + sizeMs });
      return { ok: true as const, resetAt: t + sizeMs };
    }
    w.count++;
    return { ok: w.count <= limit, resetAt: w.resetAt };
  }

  function sweep() {
    const t = now();
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
  }

  return {
    check(ip) {
      sweep();
      const minute = 60_000;
      const day = 86_400_000;
      // Order matters: a request refused by an earlier window does not
      // consume the later ones.
      for (const [window, key, limit, size] of [
        ["ip-minute", `ip:m:${ip}`, LIMITS.perIpPerMinute, minute],
        ["ip-day", `ip:d:${ip}`, LIMITS.perIpPerDay, day],
        ["instance-day", "instance:d", LIMITS.perInstancePerDay, day],
      ] as const) {
        const r = hit(key, limit, size);
        if (!r.ok) {
          return {
            ok: false,
            window,
            retryAfterSec: Math.max(1, Math.ceil((r.resetAt - now()) / 1000)),
          };
        }
      }
      return { ok: true };
    },
  };
}

/** Client IP as Vercel reports it; "unknown" shares one bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Same-origin check for a browser POST. A missing Origin (curl, server
 * callers) is allowed; Bot Protection and the rate limits cover those.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too-large" | "unreadable" };

/**
 * Read a request body as UTF-8, counting bytes as they arrive and
 * cancelling the stream once `maxBytes` is passed. A declared
 * Content-Length over the budget is refused before reading; a missing or
 * understated one cannot make this buffer more than the budget plus one
 * chunk.
 */
export async function readBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<BodyResult> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) {
    return { ok: false, reason: "too-large" };
  }
  if (!req.body) return { ok: true, text: "" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}
