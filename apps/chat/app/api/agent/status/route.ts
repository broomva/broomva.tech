/**
 * GET /api/agent/status — proxy to Arcan /status
 *
 * Returns the agent runtime status for authenticated users.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLifeJWT } from "@/lib/ai/vault/jwt";

export async function GET() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const arcanUrl = process.env.ARCAN_URL;
  if (!arcanUrl) {
    return NextResponse.json(
      { error: "Arcan not configured" },
      { status: 503 },
    );
  }

  const token = await signLifeJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  const res = await fetch(`${arcanUrl}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
