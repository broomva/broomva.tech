import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { deviceAuthCode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { signLifeJWT } from "@/lib/ai/vault/jwt";

/**
 * POST /api/auth/device/authorize
 *
 * Called from the /device page when the logged-in user approves or denies a device code.
 *
 * Body: { "user_code": "ABCD-1234", "action": "approve" | "deny" }
 */
export async function POST(request: Request) {
  try {
    return await handleAuthorize(request);
  } catch (error) {
    console.error("Device authorize failed:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

async function handleAuthorize(request: Request) {
  // Require browser session
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json(
      { error: "Not authenticated. Please sign in first." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const userCode = String(body.user_code ?? "")
    .toUpperCase()
    .trim();
  const action = body.action as string;

  if (!userCode || !["approve", "deny"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid request. Provide user_code and action (approve|deny)." },
      { status: 400 }
    );
  }

  const [record] = await db
    .select()
    .from(deviceAuthCode)
    .where(
      and(
        eq(deviceAuthCode.userCode, userCode),
        eq(deviceAuthCode.status, "pending")
      )
    )
    .limit(1);

  if (!record) {
    return NextResponse.json(
      { error: "Code not found or already used." },
      { status: 404 }
    );
  }

  if (new Date() > record.expiresAt) {
    await db
      .update(deviceAuthCode)
      .set({ status: "expired" })
      .where(eq(deviceAuthCode.id, record.id));

    return NextResponse.json(
      { error: "Code has expired. Request a new one." },
      { status: 410 }
    );
  }

  if (action === "deny") {
    await db
      .update(deviceAuthCode)
      .set({ status: "denied", userId: sessionData.user.id })
      .where(eq(deviceAuthCode.id, record.id));

    return NextResponse.json({ status: "denied" });
  }

  // Approve: sign a JWT for the CLI to use as Bearer token
  const token = await signLifeJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  await db
    .update(deviceAuthCode)
    .set({
      status: "approved",
      userId: sessionData.user.id,
      sessionToken: token,
    })
    .where(eq(deviceAuthCode.id, record.id));

  return NextResponse.json({
    status: "approved",
    client_id: record.clientId,
  });
}
