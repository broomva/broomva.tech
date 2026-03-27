import { NextResponse } from "next/server";
import { withRelayAuth } from "@/lib/api/with-auth";
import { createClient } from "redis";
import { nodeCommandsChannel } from "@/lib/relay/redis-channels";
import { db } from "@/lib/db/client";
import { relayNode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/relay/poll?nodeId=xxx
 *
 * Non-blocking poll for pending commands. Returns immediately with any
 * queued command from Redis list, or null if none pending.
 * Also serves as heartbeat — updates lastSeenAt.
 *
 * relayd calls this every 1-2s.
 */
export const GET = withRelayAuth(async (request, { userId }) => {
  const url = new URL(request.url);
  const nodeId = url.searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json(
      { error: "Missing nodeId parameter" },
      { status: 400 },
    );
  }

  try {
    // Heartbeat — only update nodes owned by the authenticated user
    await db
      .update(relayNode)
      .set({ lastSeenAt: new Date(), status: "online" })
      .where(and(eq(relayNode.id, nodeId), eq(relayNode.userId, userId)));

    // Pop next command from Redis list (non-blocking)
    const redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    await redis.connect();

    const channel = nodeCommandsChannel(nodeId);
    const message = await redis.lPop(channel);
    await redis.quit();

    if (message) {
      return NextResponse.json({ command: JSON.parse(message) });
    }

    return NextResponse.json({ command: null });
  } catch (err) {
    console.error("[relay/poll] Error:", err);
    return NextResponse.json({ command: null });
  }
});
