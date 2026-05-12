/**
 * POST /api/agent/chat — proxy to Arcan /chat
 *
 * Authenticates user via Better Auth, signs a JWT, and forwards
 * the chat request to the Arcan agent runtime.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLifeJWT } from "@/lib/ai/vault/jwt";

export async function POST(request: Request) {
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

  const body = await request.json();

  const res = await fetch(`${arcanUrl}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
