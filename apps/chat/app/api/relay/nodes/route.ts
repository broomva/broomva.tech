import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getUserRelayNodes, getRelayMetrics } from "@/lib/db/relay-queries";

export const GET = withAuth(async (_request, { userId }) => {
  try {
    const [nodes, metrics] = await Promise.all([
      getUserRelayNodes(userId),
      getRelayMetrics(userId),
    ]);

    return NextResponse.json({ nodes, metrics });
  } catch (err) {
    console.error("[relay] Failed to list nodes:", err);
    return NextResponse.json(
      { error: "Failed to list relay nodes" },
      { status: 500 },
    );
  }
});
