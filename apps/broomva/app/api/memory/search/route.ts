/**
 * POST /api/memory/search — proxy to lagod /v1/memory/search
 *
 * Server-side scored search with optional graph traversal.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLagoJWT } from "@/lib/ai/vault/jwt";

export async function POST(request: Request) {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) {
    return NextResponse.json(
      { error: "Lago not configured" },
      { status: 503 }
    );
  }

  const token = await signLagoJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  const body = await request.json();

  const res = await fetch(`${lagoUrl}/v1/memory/search`, {
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
