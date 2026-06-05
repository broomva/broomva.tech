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
 * self-closes after ~55s; EventSource auto-reconnects with an updated cursor,
 * which keeps us within serverless function-duration limits.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll cadence + hard lifetime — re-tuned together (lifetime ≫ serverless cap). */
const POLL_MS = 2500;
const MAX_LIFETIME_MS = 55_000;

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

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Abort when the client disconnects.
      request.signal.addEventListener("abort", close);

      send("ready", { since: cursor.toISOString() });

      const startedAt = Date.now();
      try {
        while (!closed && Date.now() - startedAt < MAX_LIFETIME_MS) {
          const events = await listHandoffEvents(ownerId, { since: cursor });
          if (events.length > 0) {
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
            }
            const newest = events[0];
            if (newest) cursor = new Date(newest.createdAt);
          } else {
            // Heartbeat comment keeps proxies from buffering / timing out.
            if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
          }
          await sleep(POLL_MS, request.signal);
        }
      } catch {
        // DB hiccup or aborted wait — end the stream; client reconnects.
      } finally {
        send("bye", { reconnect: true });
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
