/**
 * Input validation and abuse limits for POST /api/ask.
 *
 * The endpoint is anonymous and spends model tokens, so every request is
 * bounded before any model call: turn count, message size, total size, and
 * per-IP / per-instance rate windows. Counters are in memory on purpose:
 * the site runs on Fluid compute (instances are reused), Redis is optional
 * and has been unhealthy, and Vercel Bot Protection sits in front. A team
 * AI Gateway budget is the hard spend ceiling; these limits keep one client
 * from using it up.
 */
import { z } from "zod";

export const LIMITS = {
  /** Messages accepted in one request (the client sends the whole thread). */
  maxMessages: 24,
  /** Most recent messages forwarded to the model. */
  modelWindow: 10,
  maxCharsPerMessage: 2_000,
  maxTotalChars: 16_000,
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

  let total = 0;
  const messages: TextMessage[] = [];
  for (const [i, m] of parsed.data.messages.entries()) {
    const text = m.parts
      .map((p) => textPart.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data.text)
      .join("")
      .trim();
    if (text.length > LIMITS.maxCharsPerMessage) {
      return {
        ok: false,
        error: `Messages are limited to ${LIMITS.maxCharsPerMessage} characters.`,
      };
    }
    total += text.length;
    if (!text) continue;
    messages.push({
      id: m.id ?? `m${i}`,
      role: m.role,
      parts: [{ type: "text", text }],
    });
  }

  if (total > LIMITS.maxTotalChars) {
    return {
      ok: false,
      error: "This conversation is too long. Start a new one.",
    };
  }
  const last = messages.at(-1);
  if (last?.role !== "user") {
    return { ok: false, error: "The last message must be a question." };
  }

  return {
    ok: true,
    messages: messages.slice(-LIMITS.modelWindow),
    question: last.parts[0].text,
  };
}

interface Window {
  count: number;
  resetAt: number;
}

export interface Limiter {
  check(ip: string): { ok: true } | { ok: false; retryAfterSec: number };
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
      for (const [key, limit, size] of [
        [`ip:m:${ip}`, LIMITS.perIpPerMinute, minute],
        [`ip:d:${ip}`, LIMITS.perIpPerDay, day],
        ["instance:d", LIMITS.perInstancePerDay, day],
      ] as const) {
        const r = hit(key, limit, size);
        if (!r.ok) {
          return {
            ok: false,
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
