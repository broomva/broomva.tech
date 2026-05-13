import "server-only";
import type { NextRequest } from "next/server";
import { requireSession } from "../../_lib/auth";
import { getUpstream } from "../../_lib/upstream";

// Next.js 16 with cacheComponents enabled disallows per-route `runtime` and
// `dynamic` exports. The handler is inherently uncacheable — it reads
// req.signal, NextRequest.nextUrl.searchParams, and returns a streaming
// ReadableStream — so Next 16 auto-detects it as dynamic without needing the
// directive.

/**
 * GET /api/life-proxy/sse/[sid]
 *
 * Server-Sent Events stream of Prosopon envelopes for one session.
 *
 *   Query params:
 *     from_seq   — optional bigint as string; default "0". The cursor to
 *                  resume from. Browser writes the URL hash; the client
 *                  reads it and passes it here.
 *
 *   Response:
 *     text/event-stream, one envelope per `data:` line as JSON.
 *
 *   Auth:
 *     Better Auth session cookie. 401 if missing. The Tier-1 JWT mint for
 *     the lifegw adapter is server-side only; it never crosses the wire.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sid: string }> },
): Promise<Response> {
  let consumer;
  try {
    consumer = await requireSession();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    throw resp;
  }

  const { sid } = await ctx.params;
  const fromSeqRaw = req.nextUrl.searchParams.get("from_seq") ?? "0";
  const fromSeq = (() => {
    try {
      return BigInt(fromSeqRaw);
    } catch {
      return 0n;
    }
  })();

  const upstream = getUpstream();
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Send an immediate connect event so the client can confirm the
        // session is live. ProsoponClient treats unknown event types as
        // metadata.
        const hello = JSON.stringify({
          type: "_meta",
          sid,
          consumer: { userId: consumer.userId },
          upstream: upstream.kind,
        });
        controller.enqueue(encoder.encode(`event: hello\ndata: ${hello}\n\n`));

        for await (const envelope of upstream.streamSession({
          sid,
          fromSeq,
          signal: abortController.signal,
        })) {
          if (abortController.signal.aborted) break;
          const line = `data: ${JSON.stringify(envelope, replacerBigInt)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        const errLine = `event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`;
        try {
          controller.enqueue(encoder.encode(errLine));
        } catch {
          // controller may already be closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** JSON.stringify replacer that emits BigInts as decimal strings. */
function replacerBigInt(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
