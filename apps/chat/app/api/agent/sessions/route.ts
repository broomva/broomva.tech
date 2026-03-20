/**
 * GET/POST /api/agent/sessions — proxy to Arcan /sessions
 *
 * Lists or creates agent sessions via the authenticated Arcan runtime.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLifeJWT } from "@/lib/ai/vault/jwt";

async function getArcanUrl(): Promise<string | null> {
  return process.env.ARCAN_URL ?? null;
}

async function getAuthToken(
  sessionData: { user: { id: string; email?: string | null } } | null,
): Promise<string | null> {
  if (!sessionData?.user?.id) return null;
  return signLifeJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });
}

export async function GET() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  const token = await getAuthToken(sessionData);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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
}

export async function POST(request: Request) {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  const token = await getAuthToken(sessionData);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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
}
