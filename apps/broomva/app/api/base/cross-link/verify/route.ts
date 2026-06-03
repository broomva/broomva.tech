import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchPasskeyStatus } from "@/lib/anima/passkey-status";
import { getSafeSession } from "@/lib/auth";
import { validateCrossLink } from "@/lib/base/cross-link";
import {
  getBaseAccountLink,
  getNonceRow,
  isMissingTable,
  markCrossLink,
  markNonceUsed,
  validateNonceRow,
} from "@/lib/base/queries";
import { extractSiweNonce, verifyBaseSignature } from "@/lib/base/verify-siwe";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (
    !isObject(body) ||
    typeof body.message !== "string" ||
    typeof body.signature !== "string"
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

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

  try {
    const baseLink = await getBaseAccountLink(userId);
    if (!baseLink) {
      return NextResponse.json({ error: "no_base_account" }, { status: 400 });
    }

    const submittedNonce = extractSiweNonce(body.message);
    if (submittedNonce === null) {
      return NextResponse.json({ error: "nonce_invalid" }, { status: 400 });
    }

    const nonceRow = await getNonceRow(submittedNonce);
    const validation = validateNonceRow(nonceRow, userId, new Date());
    const crossLinkValidation = validateCrossLink({
      message: body.message,
      animaDid: animaStatus.did,
      baseAddress: baseLink.address,
      nonceValidation: validation,
    });
    if (!crossLinkValidation.ok) {
      return NextResponse.json(
        { error: crossLinkValidation.error },
        { status: 400 },
      );
    }

    await markNonceUsed(submittedNonce, new Date());

    const valid = await verifyBaseSignature({
      address: baseLink.address,
      message: body.message,
      signature: body.signature,
    });
    if (!valid) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    await markCrossLink(userId, animaStatus.did, new Date());
    return NextResponse.json({ crossLinked: true });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
