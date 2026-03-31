import { NextResponse } from "next/server";
import { withRelayAuthAndValidation } from "@/lib/api/with-auth";
import { z } from "zod";
import {
  sessionOutputChannel,
  nodeEventsChannel,
  sessionReplayKey,
  requestResponseChannel,
  REPLAY_BUFFER_SIZE,
} from "@/lib/relay/redis-channels";
import { getRelayRedis } from "@/lib/relay/redis";
import { db } from "@/lib/db/client";
import { relaySession, relayNode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
  redis: Awaited<ReturnType<typeof getRelayRedis>>,
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
export const POST = withRelayAuthAndValidation(
  eventsSchema,
  async (_request, { userId, body }) => {
    const { nodeId, events } = body;

    // Verify the node belongs to the authenticated user
    const [node] = await db
      .select({ id: relayNode.id })
      .from(relayNode)
      .where(and(eq(relayNode.id, nodeId), eq(relayNode.userId, userId)))
      .limit(1);

    if (!node) {
      return NextResponse.json(
        { error: "Node not found or not owned by user" },
        { status: 403 },
      );
    }

    try {
      const redis = await getRelayRedis();

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

          case "content_delta": {
            // Publish to live subscribers only — skip replay buffer to
            // prevent overflow from high-frequency streaming deltas.
            await redis.publish(
              sessionOutputChannel(event.sessionId),
              payload,
            );
            break;
          }

          case "content_block_start":
          case "content_block_stop":
          case "tool_result":
          case "turn_result":
          case "assistant_message":
          case "tool_event":
          case "approval_request":
          case "workspace_status":
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
            // Session may already exist if created via POST /api/relay/sessions.
            // The daemon sends session_created as confirmation — skip if duplicate.
            await db
              .insert(relaySession)
              .values({
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
              })
              .onConflictDoNothing();
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

          case "dir_listing": {
            // Publish to the one-shot response channel so the waiting
            // /api/relay/nodes/[nodeId]/fs route receives the result.
            const respChannel = requestResponseChannel(
              (event as unknown as { requestId: string }).requestId,
            );
            await redis.publish(respChannel, payload);
            break;
          }

          default:
            await redis.publish(nodeEventsChannel(nodeId), payload);
        }
      }

      return NextResponse.json({ received: events.length });
    } catch (err) {
      console.error("[relay/events] Error:", err);
      return NextResponse.json(
        { error: "Failed to process events" },
        { status: 500 },
      );
    }
  },
);
