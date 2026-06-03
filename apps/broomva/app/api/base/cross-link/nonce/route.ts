import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchPasskeyStatus } from "@/lib/anima/passkey-status";
import { getSafeSession } from "@/lib/auth";
import {
  getBaseAccountLink,
  insertNonce,
  isMissingTable,
} from "@/lib/base/queries";

export async function POST(request: NextRequest) {
  void request;

  const headerStore = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: headerStore },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const host = headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : undefined;
  const animaStatus = await fetchPasskeyStatus(base, {
    headers: { cookie: headerStore.get("cookie") ?? "" },
  });
  if (!animaStatus.enrolled || !animaStatus.did) {
    return NextResponse.json({ error: "no_anima" }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    const baseLink = await getBaseAccountLink(userId);
    if (!baseLink) {
      return NextResponse.json({ error: "no_base_account" }, { status: 400 });
    }

    await insertNonce({ nonce, userId, expiresAt });

    const message = [
      "broomva.tech onchain identity link",
      `Anima DID: ${animaStatus.did}`,
      `Base Account: ${baseLink.address}`,
      `Nonce: ${nonce}`,
    ].join("\n");

    return NextResponse.json({
      nonce,
      message,
      animaDid: animaStatus.did,
      baseAddress: baseLink.address,
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
