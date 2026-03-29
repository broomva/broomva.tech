import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import { db } from "@/lib/db/client";
import { relaySession } from "@/lib/db/schema";
import { nodeCommandsChannel } from "@/lib/relay/redis-channels";
import { getRelayRedis } from "@/lib/relay/redis";

const approveSchema = z.object({
  approvalId: z.string(),
  approved: z.boolean(),
});

/**
 * POST /api/relay/sessions/[id]/approve
 *
 * Route an approval decision to the relay node. Pushes an `approve` command
 * to the node's Redis command queue, which relayd picks up on the next poll.
 */
export const POST = withAuthAndValidation(
  approveSchema,
  async (request, { userId, body }) => {
    // Extract session ID: /api/relay/sessions/[id]/approve → at(-2)
    const sessionId = new URL(request.url).pathname.split("/").at(-2) ?? "";

    try {
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

      const redis = await getRelayRedis();
      const command = JSON.stringify({
        type: "approve",
        sessionId,
        approvalId: body.approvalId,
        approved: body.approved,
      });
      await redis.rPush(nodeCommandsChannel(session.nodeId), command);

      return NextResponse.json({ sent: true });
    } catch (err) {
      console.error("[relay/approve] Error:", err);
      return NextResponse.json(
        { error: "Failed to send approval" },
        { status: 500 },
      );
    }
  },
);
