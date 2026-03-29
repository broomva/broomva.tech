import { withRelayAuth } from "@/lib/api/with-auth";
import {
  sessionOutputChannel,
  sessionReplayKey,
} from "@/lib/relay/redis-channels";
import { createSubscriberClient, getRelayRedis } from "@/lib/relay/redis";
import { getRelaySessionById } from "@/lib/db/relay-queries";

/**
 * GET /api/relay/sessions/[id]/stream
 *
 * SSE stream of session output for the browser.
 *
 * On connect, replays the last N buffered events from Redis so reconnecting
 * browsers catch up on missed output. Then subscribes to the live pub/sub
 * channel for subsequent events.
 *
 * Authenticated via `withRelayAuth` — session or Life JWT required.
 * Validates session ownership before streaming.
 */
export const GET = withRelayAuth(async (request, { userId }) => {
  const url = new URL(request.url);
  // URL: /api/relay/sessions/[id]/stream → segment at(-2) is the id
  const sessionId = url.pathname.split("/").at(-2) ?? "";

  // Verify the session exists and belongs to the authenticated user
  const session = await getRelaySessionById(sessionId, userId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const channel = sessionOutputChannel(sessionId);
  const replayKey = sessionReplayKey(sessionId);

  const stream = new ReadableStream({
    async start(controller) {
      let subscriber: ReturnType<typeof createSubscriberClient> | null = null;

      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller already closed
        }
      };

      try {
        // Dedicated subscriber connection (required by Redis subscribe mode)
        subscriber = createSubscriberClient();
        await subscriber.connect();

        // Replay buffered events using the shared client
        const reader = await getRelayRedis();
        const buffered = await reader.lRange(replayKey, 0, -1);

        for (const item of buffered) {
          enqueue(item);
        }

        // Signal end of replay
        controller.enqueue(encoder.encode(": replayed\n\n"));

        // Subscribe for live events
        await subscriber.subscribe(channel, (message) => {
          enqueue(message);
        });

        // Keepalive every 15s to prevent proxy timeouts
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);

        request.signal.addEventListener("abort", async () => {
          clearInterval(keepalive);
          if (subscriber) {
            try {
              await subscriber.unsubscribe(channel);
              await subscriber.quit();
            } catch {}
          }
        });
      } catch (err) {
        console.error("[relay/stream] Error:", err);
        // Send error event so client can distinguish from clean close
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Stream connection failed" })}\n\n`,
            ),
          );
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
