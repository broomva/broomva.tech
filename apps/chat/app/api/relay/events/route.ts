import { NextResponse } from "next/server";
import { withAuthAndValidation } from "@/lib/api/with-auth";
import { z } from "zod";
import { createClient } from "redis";
import {
  sessionOutputChannel,
  nodeEventsChannel,
  sessionReplayKey,
  REPLAY_BUFFER_SIZE,
} from "@/lib/relay/redis-channels";
import { db } from "@/lib/db/client";
import { relaySession, relayNode } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { DaemonMessage } from "@/lib/relay/protocol";

const eventsSchema = z.object({
  nodeId: z.string().uuid(),
  events: z.array(z.record(z.string(), z.unknown())),
});

/**
 * Publish a session event to the live SSE channel and append it to the
 * replay buffer (capped list). Both steps are needed so:
 * - Live subscribers receive the event immediately.
 * - Reconnecting browsers can replay missed events.
 */
async function publishSessionEvent(
  redis: ReturnType<typeof createClient>,
  sessionId: string,
  payload: string,
): Promise<void> {
  const replayKey = sessionReplayKey(sessionId);
  await Promise.all([
    redis.publish(sessionOutputChannel(sessionId), payload),
    redis.rPush(replayKey, payload).then(() =>
      redis.lTrim(replayKey, -REPLAY_BUFFER_SIZE, -1),
    ),
  ]);
}

/**
 * POST /api/relay/events
 *
 * Receive events from relayd. Publishes to Redis for browser SSE subscribers.
 * Session events are also stored in a capped replay buffer so reconnecting
 * browsers can catch up on missed events.
 * Handles session lifecycle events (created, ended) by updating DB.
 */
export const POST = withAuthAndValidation(
  eventsSchema,
  async (_request, { userId, body }) => {
    const { nodeId, events } = body;

    let redis: ReturnType<typeof createClient> | null = null;
    try {
      redis = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
      });
      await redis.connect();

      for (const raw of events) {
        const event = raw as unknown as DaemonMessage;
        const payload = JSON.stringify(event);

        switch (event.type) {
          case "output": {
            await publishSessionEvent(redis, event.sessionId, payload);
            // Track last seen sequence for DB-level resumability
            await db
              .update(relaySession)
              .set({ lastSequence: event.seq })
              .where(eq(relaySession.id, event.sessionId));
            break;
          }

          case "assistant_message":
          case "tool_event":
          case "approval_request":
          case "session_ended": {
            await publishSessionEvent(redis, event.sessionId, payload);
            if (event.type === "session_ended") {
              await db
                .update(relaySession)
                .set({ status: "completed" })
                .where(eq(relaySession.id, event.sessionId));
            }
            break;
          }

          case "session_created": {
            await db.insert(relaySession).values({
              id: event.session.id,
              nodeId,
              userId,
              sessionType: event.session.sessionType as
                | "arcan"
                | "claude-code"
                | "codex",
              status: "active",
              name: event.session.name,
              workdir: event.session.workdir,
              model: event.session.model ?? null,
            });
            break;
          }

          case "node_info": {
            await db
              .update(relayNode)
              .set({
                hostname: event.hostname,
                capabilities: event.capabilities,
                status: "online",
                lastSeenAt: new Date(),
              })
              .where(eq(relayNode.id, nodeId));
            break;
          }

          default:
            await redis.publish(nodeEventsChannel(nodeId), payload);
        }
      }

      await redis.quit();
      return NextResponse.json({ received: events.length });
    } catch (err) {
      if (redis) {
        try {
          await redis.quit();
        } catch {}
      }
      console.error("[relay/events] Error:", err);
      return NextResponse.json(
        { error: "Failed to process events" },
        { status: 500 },
      );
    }
  },
);
