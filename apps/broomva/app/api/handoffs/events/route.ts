import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listHandoffEvents } from "@/lib/db/handoff-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * GET /api/handoffs/events — Server-Sent Events stream powering the realtime
 * timeline card on /maestro/queue (BRO-1415). Tails the owner's HandoffEvent
 * log: on connect it streams nothing historical (the page is server-rendered
 * with the current timeline), then pushes each NEW event as it lands.
 *
 * The client passes `?since=<ISO>` — the createdAt of the newest event it has —
 * so no event is missed between SSR and the EventSource connecting. The stream
 * self-closes after ~55s; the client reconnects with an updated cursor, which
 * keeps us within serverless function-duration limits.
 *
 * No `runtime`/`dynamic` route-segment config: this app runs with
 * `cacheComponents`, which forbids those exports. Reading `request` (auth
 * headers + `?since`) already makes the handler dynamic, and the default
 * runtime is Node.js (required for the DB tail).
 */

/** Poll cadence + hard lifetime + per-tick batch (lifetime ≫ serverless cap). */
const POLL_MS = 2500;
const MAX_LIFETIME_MS = 55_000;
const BATCH_LIMIT = 100;

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerId = auth.userId;

  const sinceParam = request.nextUrl.searchParams.get("since");
  const parsedSince = sinceParam ? new Date(sinceParam) : null;
  let cursor =
    parsedSince && !Number.isNaN(parsedSince.getTime())
      ? parsedSince
      : new Date();

  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      // Abort when the client disconnects.
      signal.addEventListener("abort", close);

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("ready", { since: cursor.toISOString() });

      const startedAt = Date.now();
      try {
        while (!closed && Date.now() - startedAt < MAX_LIFETIME_MS) {
          // Drain forward in batches so a burst of > BATCH_LIMIT events between
          // polls is never skipped (a naïve jump-to-newest would lose the tail).
          let emitted = 0;
          for (;;) {
            const events = await listHandoffEvents(ownerId, {
              since: cursor,
              limit: BATCH_LIMIT,
            });
            if (events.length === 0) break;
            // listHandoffEvents returns newest-first; emit oldest-first so the
            // client appends in chronological order.
            for (const ev of events.slice().reverse()) {
              send("handoff", {
                id: ev.id,
                handoffId: ev.handoffId,
                type: ev.type,
                actor: ev.actor,
                message: ev.message,
                metadata: ev.metadata,
                createdAt: ev.createdAt,
              });
              emitted++;
            }
            const newest = events[0];
            if (newest) cursor = new Date(newest.createdAt);
            if (events.length < BATCH_LIMIT || closed) break;
          }
          // Heartbeat comment keeps proxies from buffering / timing out.
          if (emitted === 0 && !closed) {
            controller.enqueue(encoder.encode(": ping\n\n"));
          }
          await sleep(POLL_MS, signal);
        }
      } catch {
        // DB hiccup or aborted wait — end the stream; client reconnects.
      } finally {
        send("bye", { reconnect: true });
        signal.removeEventListener("abort", close);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** Promise that resolves after `ms`, or rejects early if the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
