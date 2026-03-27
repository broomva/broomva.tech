import { createClient } from "redis";
import {
  sessionOutputChannel,
  sessionReplayKey,
} from "@/lib/relay/redis-channels";

/**
 * GET /api/relay/sessions/[id]/stream
 *
 * SSE stream of session output for the browser.
 *
 * On connect, replays the last N buffered events from Redis so reconnecting
 * browsers catch up on missed output. Then subscribes to the live pub/sub
 * channel for subsequent events.
 *
 * Multiple browsers can subscribe to the same session simultaneously — each
 * gets its own subscriber connection.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const encoder = new TextEncoder();
  const channel = sessionOutputChannel(sessionId);
  const replayKey = sessionReplayKey(sessionId);

  const stream = new ReadableStream({
    async start(controller) {
      let subscriber: ReturnType<typeof createClient> | null = null;

      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller already closed
        }
      };

      try {
        subscriber = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await subscriber.connect();

        // --- Replay buffered events before subscribing ---
        // Use a short-lived client so we don't block the subscriber connection
        // (subscriber.lRange is unavailable while in subscribe mode).
        const reader = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await reader.connect();
        const buffered = await reader.lRange(replayKey, 0, -1);
        await reader.quit();

        // Send replayed events with a marker so the client can distinguish them
        for (const item of buffered) {
          enqueue(item);
        }

        // Signal end of replay so the client can stop showing "connecting"
        controller.enqueue(encoder.encode(": replayed\n\n"));

        // --- Subscribe for live events ---
        await subscriber.subscribe(channel, (message) => {
          enqueue(message);
        });

        // Keepalive every 15 s to prevent proxy timeouts
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);

        _request.signal.addEventListener("abort", async () => {
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
}
