/**
 * /api/memory/files/[...path] — proxy GET/PUT/DELETE to lagod /v1/memory/files/*
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLagoJWT } from "@/lib/ai/vault/jwt";

async function getAuthContext() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return { error: "Not authenticated" as const };
  }

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) {
    return { error: "Lago not configured" as const };
  }

  const token = await signLagoJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  return { lagoUrl, token };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const ctx = await getAuthContext();
  if ("error" in ctx) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.error === "Not authenticated" ? 401 : 503 }
    );
  }

  const { path } = await params;
  const filePath = `/${path.join("/")}`;
  const encoded = encodeURIComponent(filePath);

  const res = await fetch(`${ctx.lagoUrl}/v1/memory/files/${encoded}`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const ctx = await getAuthContext();
  if ("error" in ctx) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.error === "Not authenticated" ? 401 : 503 }
    );
  }

  const { path } = await params;
  const filePath = `/${path.join("/")}`;
  const encoded = encodeURIComponent(filePath);
  const body = await request.text();

  const res = await fetch(`${ctx.lagoUrl}/v1/memory/files/${encoded}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.token}` },
    body,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const ctx = await getAuthContext();
  if ("error" in ctx) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.error === "Not authenticated" ? 401 : 503 }
    );
  }

  const { path } = await params;
  const filePath = `/${path.join("/")}`;
  const encoded = encodeURIComponent(filePath);

  const res = await fetch(`${ctx.lagoUrl}/v1/memory/files/${encoded}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });

  return new NextResponse(null, { status: res.status });
}
