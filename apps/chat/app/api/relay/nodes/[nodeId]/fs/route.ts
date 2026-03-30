import { NextResponse } from "next/server";
import { withRelayAuth } from "@/lib/api/with-auth";
import { db } from "@/lib/db/client";
import { relayNode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { nodeCommandsChannel, requestResponseChannel } from "@/lib/relay/redis-channels";
import { getRelayRedis, createSubscriberClient } from "@/lib/relay/redis";
import type { DirEntry } from "@/lib/relay/protocol";

/** Timeout for waiting on daemon response (ms). */
const RESPONSE_TIMEOUT_MS = 8_000;

/**
 * GET /api/relay/nodes/[nodeId]/fs?path=/some/path
 *
 * Lists the contents of a directory on the remote relay node.
 *
 * Flow:
 *  1. Validates node ownership.
 *  2. Queues a `list_dir` command to the node's Redis command list.
 *  3. Subscribes to a one-shot response channel `relay:response:{requestId}`.
 *  4. Daemon picks up the command, lists the directory, pushes the result
 *     back via POST /api/relay/events with type `dir_listing`.
 *     The events route detects `dir_listing` and publishes to the response channel.
 *  5. Returns the directory listing to the browser.
 *  6. Times out after 8 seconds if the daemon doesn't respond.
 */
export const GET = withRelayAuth(
  async (
    request: Request,
    { userId },
  ) => {
    const url = new URL(request.url);
    const nodeId = url.pathname.split("/").at(-2) ?? "";
    const path = url.searchParams.get("path") || "~";

    if (!nodeId) {
      return NextResponse.json(
        { error: "Missing nodeId" },
        { status: 400 },
      );
    }

    // Verify node ownership
    const [node] = await db
      .select({ id: relayNode.id, status: relayNode.status })
      .from(relayNode)
      .where(and(eq(relayNode.id, nodeId), eq(relayNode.userId, userId)))
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

    const requestId = crypto.randomUUID();
    const responseChannel = requestResponseChannel(requestId);

    // Create a dedicated subscriber for this one-shot exchange.
    const subscriber = createSubscriberClient();

    try {
      await subscriber.connect();

      // Set up the response listener BEFORE sending the command.
      const responsePromise = new Promise<{
        path: string;
        entries: DirEntry[];
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Daemon did not respond within timeout"));
        }, RESPONSE_TIMEOUT_MS);

        subscriber.subscribe(responseChannel, (message) => {
          clearTimeout(timeout);
          try {
            const data = JSON.parse(message);
            resolve({ path: data.path, entries: data.entries });
          } catch {
            reject(new Error("Invalid response from daemon"));
          }
        });
      });

      // Queue the list_dir command.
      const redis = await getRelayRedis();
      const command = {
        type: "list_dir",
        path,
        requestId,
      };
      await redis.rPush(
        nodeCommandsChannel(nodeId),
        JSON.stringify(command),
      );

      // Wait for the daemon's response.
      const result = await responsePromise;

      return NextResponse.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to list directory";
      console.error("[relay/fs] Error:", message);

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
