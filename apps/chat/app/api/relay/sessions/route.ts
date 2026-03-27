import { NextResponse } from "next/server";
import { withRelayAuth } from "@/lib/api/with-auth";
import { getUserRelaySessions } from "@/lib/db/relay-queries";

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
