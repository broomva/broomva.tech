/**
 * GET/POST /api/agent/sessions — proxy to Arcan /sessions
 *
 * Lists or creates agent sessions via the authenticated Arcan runtime.
 */

import { NextResponse } from "next/server";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { withAuth } from "@/lib/api/with-auth";

async function getArcanUrl(): Promise<string | null> {
  return process.env.ARCAN_URL ?? null;
}

async function getAuthToken(userId: string, email: string | null) {
  return signLifeJWT({
    id: userId,
    email: email ?? "",
  });
}

export const GET = withAuth(async (_request, { userId, email }) => {
  const token = await getAuthToken(userId, email);
  const arcanUrl = await getArcanUrl();
  if (!arcanUrl) {
    return NextResponse.json(
      { error: "Arcan not configured" },
      { status: 503 },
    );
  }

  const res = await fetch(`${arcanUrl}/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
});

export const POST = withAuth(async (request, { userId, email }) => {
  const token = await getAuthToken(userId, email);
  const arcanUrl = await getArcanUrl();
  if (!arcanUrl) {
    return NextResponse.json(
      { error: "Arcan not configured" },
      { status: 503 },
    );
  }

  const body = await request.json();

  const res = await fetch(`${arcanUrl}/sessions`, {
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
