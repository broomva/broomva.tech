import { NextResponse } from "next/server";
import { withAuthAndValidation } from "@/lib/api/with-auth";
import { z } from "zod";
import { createClient } from "redis";
import {
  sessionOutputChannel,
  nodeEventsChannel,
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
 * POST /api/relay/events
 *
 * Receive events from relayd. Publishes to Redis for browser SSE subscribers.
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

        switch (event.type) {
          case "output": {
            // Publish to session-specific channel for browser subscribers
            await redis.publish(
              sessionOutputChannel(event.sessionId),
              JSON.stringify(event),
            );
            // Update sequence in DB
            await db
              .update(relaySession)
              .set({ lastSequence: event.seq })
              .where(eq(relaySession.id, event.sessionId));
            break;
          }

          case "session_created": {
            // Create session record in DB
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

          case "session_ended": {
            await db
              .update(relaySession)
              .set({ status: "completed" })
              .where(eq(relaySession.id, event.sessionId));
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
            // Forward to node events channel for any other type
            await redis.publish(
              nodeEventsChannel(nodeId),
              JSON.stringify(event),
            );
        }
      }

      await redis.quit();
      return NextResponse.json({ received: events.length });
    } catch (err) {
      if (redis) {
        try { await redis.quit(); } catch {}
      }
      console.error("[relay/events] Error:", err);
      return NextResponse.json(
        { error: "Failed to process events" },
        { status: 500 },
      );
    }
  },
);
