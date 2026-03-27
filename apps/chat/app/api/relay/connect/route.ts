import { NextResponse } from "next/server";
import { withAuthAndValidation } from "@/lib/api/with-auth";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { relayNode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const connectSchema = z.object({
  name: z.string().min(1),
  hostname: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
});

/**
 * POST /api/relay/connect
 *
 * Register or reconnect a relay node. Called by relayd on startup.
 * Returns the node ID for subsequent poll/events calls.
 */
export const POST = withAuthAndValidation(
  connectSchema,
  async (_request, { userId, body }) => {
    try {
      // Check for existing node with same name for this user
      const [existing] = await db
        .select()
        .from(relayNode)
        .where(and(eq(relayNode.userId, userId), eq(relayNode.name, body.name)))
        .limit(1);

      if (existing) {
        // Reconnect: update status and capabilities
        await db
          .update(relayNode)
          .set({
            status: "online",
            hostname: body.hostname,
            lastSeenAt: new Date(),
            capabilities: body.capabilities,
          })
          .where(eq(relayNode.id, existing.id));

        return NextResponse.json({
          nodeId: existing.id,
          status: "reconnected",
        });
      }

      // New node registration
      const [node] = await db
        .insert(relayNode)
        .values({
          userId,
          name: body.name,
          hostname: body.hostname,
          status: "online",
          lastSeenAt: new Date(),
          capabilities: body.capabilities,
        })
        .returning();

      return NextResponse.json(
        { nodeId: node.id, status: "registered" },
        { status: 201 },
      );
    } catch (err) {
      console.error("[relay/connect] Failed:", err);
      return NextResponse.json(
        { error: "Failed to register relay node" },
        { status: 500 },
      );
    }
  },
);
