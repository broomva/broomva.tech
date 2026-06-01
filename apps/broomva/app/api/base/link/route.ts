import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import {
  getNonceRow,
  isMissingTable,
  markNonceUsed,
  upsertBaseAccount,
  validateNonceRow,
} from "@/lib/base/queries";
import { extractSiweNonce, verifyBaseSignature } from "@/lib/base/verify-siwe";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseChainId(input: unknown): number | null {
  if (typeof input === "number" && Number.isInteger(input)) {
    return input;
  }
  if (typeof input === "string") {
    const n = input.startsWith("0x")
      ? Number.parseInt(input, 16)
      : Number.parseInt(input, 10);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  if (
    !isObject(body) ||
    typeof body.address !== "string" ||
    typeof body.message !== "string" ||
    typeof body.signature !== "string" ||
    !("chainId" in body)
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { address, message, signature } = body;
  const chainId = parseChainId(body.chainId);
  if (chainId === null) {
    return NextResponse.json({ error: "invalid_chain_id" }, { status: 400 });
  }

  const submittedNonce = extractSiweNonce(message);
  if (submittedNonce === null) {
    return NextResponse.json({ error: "missing_nonce" }, { status: 400 });
  }

  try {
    const row = await getNonceRow(submittedNonce);
    const validation = validateNonceRow(row, userId, new Date());
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    await markNonceUsed(submittedNonce, new Date());

    const valid = await verifyBaseSignature({ address, message, signature });
    if (!valid) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    await upsertBaseAccount({
      id: crypto.randomUUID(),
      userId,
      address,
      chainId,
      verifiedAt: new Date(),
    });

    return NextResponse.json({ linked: true, address });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
