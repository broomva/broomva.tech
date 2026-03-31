import { NextResponse } from "next/server";
import { withRelayAuth } from "@/lib/api/with-auth";
import { db } from "@/lib/db/client";
import { relaySession } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  nodeCommandsChannel,
  requestResponseChannel,
} from "@/lib/relay/redis-channels";
import { getRelayRedis, createSubscriberClient } from "@/lib/relay/redis";
import type { HistoryMessage } from "@/lib/relay/protocol";

/** Timeout for waiting on daemon response (ms). */
const RESPONSE_TIMEOUT_MS = 10_000;

/**
 * GET /api/relay/sessions/[id]/history
 *
 * Load conversation history from the daemon's local Claude Code session files.
 *
 * Flow:
 *  1. Authenticates and verifies session ownership.
 *  2. Queues a `load_history` command to the session's node via Redis.
 *  3. Subscribes to a one-shot response channel `relay:response:{requestId}`.
 *  4. Daemon reads the JSONL file and pushes `history_messages` back via events.
 *  5. Returns the messages as JSON.
 *  6. Times out after 10 seconds if the daemon doesn't respond.
 */
export const GET = withRelayAuth(
  async (request: Request, { userId }) => {
    const url = new URL(request.url);
    const sessionId = url.pathname.split("/").at(-2) ?? "";

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 },
      );
    }

    // Look up the session to verify ownership and get the nodeId
    const [session] = await db
      .select()
      .from(relaySession)
      .where(
        and(eq(relaySession.id, sessionId), eq(relaySession.userId, userId)),
      )
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 },
      );
    }

    // New sessions without a Claude session mapping have no history yet.
    // Skip the daemon call to avoid loading a previous unrelated conversation.
    if (!session.claudeSessionId) {
      return NextResponse.json({ messages: [] });
    }

    const requestId = crypto.randomUUID();
    const responseChannel = requestResponseChannel(requestId);

    // Create a dedicated subscriber for this one-shot exchange.
    const subscriber = createSubscriberClient();

    try {
      await subscriber.connect();

      // Set up the response listener BEFORE sending the command.
      const responsePromise = new Promise<{
        messages: HistoryMessage[];
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Daemon did not respond within timeout"));
        }, RESPONSE_TIMEOUT_MS);

        subscriber.subscribe(responseChannel, (message) => {
          clearTimeout(timeout);
          try {
            const data = JSON.parse(message);
            resolve({ messages: data.messages ?? [] });
          } catch {
            reject(new Error("Invalid response from daemon"));
          }
        });
      });

      // Queue the load_history command to the node.
      const redis = await getRelayRedis();
      const command = {
        type: "load_history",
        sessionId,
        requestId,
      };
      await redis.rPush(
        nodeCommandsChannel(session.nodeId),
        JSON.stringify(command),
      );

      // Wait for the daemon's response.
      const result = await responsePromise;

      return NextResponse.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load history";
      console.error("[relay/history] Error:", message);

      return NextResponse.json(
        { error: message },
        { status: 504 },
      );
    } finally {
      // Clean up the subscriber connection.
      try {
        await subscriber.unsubscribe(responseChannel);
        await subscriber.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
    }
  },
);
