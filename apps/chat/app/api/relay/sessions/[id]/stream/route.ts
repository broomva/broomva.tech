import { createClient } from "redis";
import { sessionOutputChannel } from "@/lib/relay/redis-channels";

/**
 * GET /api/relay/sessions/[id]/stream
 *
 * SSE stream of session output for the browser. Subscribes to the
 * Redis pub/sub channel that relayd publishes to via /api/relay/events.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const encoder = new TextEncoder();
  const channel = sessionOutputChannel(sessionId);

  const stream = new ReadableStream({
    async start(controller) {
      let subscriber: ReturnType<typeof createClient> | null = null;

      try {
        subscriber = createClient({
          url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        await subscriber.connect();

        // Send initial SSE comment as keepalive
        controller.enqueue(encoder.encode(": connected\n\n"));

        await subscriber.subscribe(channel, (message) => {
          try {
            const sseData = `data: ${message}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          } catch {
            // Controller closed
          }
        });

        // Keepalive every 15s to prevent connection timeout
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepalive);
          }
        }, 15_000);

        // Clean up when client disconnects
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
