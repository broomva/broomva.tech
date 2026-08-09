/**
 * GET /api/agent/status — proxy to Arcan /status
 *
 * Returns the agent runtime status for authenticated users.
 */

import { NextResponse } from "next/server";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { withAuth } from "@/lib/api/with-auth";

export const GET = withAuth(async (_request, { userId, email }) => {
  const arcanUrl = process.env.ARCAN_URL;
  if (!arcanUrl) {
    return NextResponse.json(
      { error: "Arcan not configured" },
      { status: 503 },
    );
  }

  const token = await signLifeJWT({
    id: userId,
    email: email ?? "",
  });

  const res = await fetch(`${arcanUrl}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});
