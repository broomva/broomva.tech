import { NextResponse } from "next/server";
import { withAuthAndValidation } from "@/lib/api/with-auth";
import { z } from "zod";
import { nodeCommandsChannel } from "@/lib/relay/redis-channels";
import { getRelayRedis } from "@/lib/relay/redis";
import { db } from "@/lib/db/client";
import { relaySession } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const inputSchema = z.object({
  data: z.string(),
});

/**
 * POST /api/relay/sessions/[id]/input
 *
 * Send input (text or keystrokes) to a relay session.
 * Pushes an input command to the session's node's Redis command queue.
 */
export const POST = withAuthAndValidation(
  inputSchema,
  async (request, { userId, body }) => {
    const url = new URL(request.url);
    const sessionId = url.pathname.split("/").at(-2) ?? "";

    try {
      // Look up the session to find its node
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

      // Push input command to the node's command queue
      const redis = await getRelayRedis();
      const command = JSON.stringify({
        type: "input",
        sessionId,
        data: body.data,
      });
      await redis.rPush(nodeCommandsChannel(session.nodeId), command);

      return NextResponse.json({ sent: true });
    } catch (err) {
      console.error("[relay/input] Error:", err);
      return NextResponse.json(
        { error: "Failed to send input" },
        { status: 500 },
      );
    }
  },
);
