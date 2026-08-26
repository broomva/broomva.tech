/**
 * POST /api/agent/chat — proxy to Arcan /chat
 *
 * Authenticates user via Better Auth, signs a JWT, and forwards
 * the chat request to the Arcan agent runtime.
 */

import { NextResponse } from "next/server";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { withAuth } from "@/lib/api/with-auth";

export const POST = withAuth(async (request, { userId, email }) => {
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
});
