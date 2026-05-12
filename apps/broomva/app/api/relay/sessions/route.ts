import { NextResponse } from "next/server";
import { withRelayAuth, withRelayAuthAndValidation } from "@/lib/api/with-auth";
import { getUserRelaySessions } from "@/lib/db/relay-queries";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { relayNode, relaySession } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nodeCommandsChannel } from "@/lib/relay/redis-channels";
import { getRelayRedis } from "@/lib/relay/redis";

const spawnSchema = z.object({
  nodeId: z.string().uuid(),
  sessionType: z.enum(["claude-code", "arcan", "codex"]),
  workdir: z.string().min(1).default("/"),
  name: z.string().min(1).optional(),
  model: z.string().optional(),
});

export const GET = withRelayAuth(async (_request, { userId }) => {
  try {
    const sessions = await getUserRelaySessions(userId);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[relay] Failed to list sessions:", err);
    return NextResponse.json(
      { error: "Failed to list relay sessions" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/relay/sessions
 *
 * Create a relay session and enqueue a Spawn command to the node via Redis.
 * The daemon polls /api/relay/poll, receives the Spawn, and starts the agent process.
 */
export const POST = withRelayAuthAndValidation(
  spawnSchema,
  async (_request, { userId, body }) => {
    try {
      // Verify the node belongs to the authenticated user
      const [node] = await db
        .select()
        .from(relayNode)
        .where(and(eq(relayNode.id, body.nodeId), eq(relayNode.userId, userId)))
        .limit(1);

      if (!node) {
        return NextResponse.json(
          { error: "Node not found or not owned by user" },
          { status: 404 },
        );
      }

      if (node.status !== "online") {
        return NextResponse.json(
          { error: "Node is not online" },
          { status: 409 },
        );
      }

      // Create the RelaySession record
      const sessionName =
        body.name ?? `${body.sessionType}-${Date.now()}`;

      const [session] = await db
        .insert(relaySession)
        .values({
          nodeId: body.nodeId,
          userId,
          sessionType: body.sessionType,
          status: "active",
          name: sessionName,
          workdir: body.workdir,
          model: body.model ?? null,
        })
        .returning();

      // Enqueue Spawn command to Redis — daemon picks it up on next poll
      const spawnCommand = {
        type: "spawn",
        sessionType: body.sessionType,
        config: {
          name: sessionName,
          workdir: body.workdir,
          ...(body.model ? { model: body.model } : {}),
          sessionId: session.id,
        },
      };

      const redis = await getRelayRedis();
      await redis.rPush(
        nodeCommandsChannel(body.nodeId),
        JSON.stringify(spawnCommand),
      );

      return NextResponse.json(
        { sessionId: session.id, status: "spawning" },
        { status: 201 },
      );
    } catch (err) {
      console.error("[relay/sessions] Failed to create session:", err);
      return NextResponse.json(
        { error: "Failed to create relay session" },
        { status: 500 },
      );
    }
  },
);
