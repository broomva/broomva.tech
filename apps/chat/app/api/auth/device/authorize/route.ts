import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { deviceAuthCode } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { withAuthAndValidation } from "@/lib/api/with-auth";

const authorizeSchema = z.object({
  user_code: z.string().min(1, "user_code is required"),
  action: z.enum(["approve", "deny"]),
});

/**
 * POST /api/auth/device/authorize
 *
 * Called from the /device page when the logged-in user approves or denies a device code.
 */
export const POST = withAuthAndValidation(
  authorizeSchema,
  async (_request, { userId, email, body }) => {
    const userCode = body.user_code.toUpperCase().trim();
    const { action } = body;

    const [record] = await db
      .select()
      .from(deviceAuthCode)
      .where(
        and(
          eq(deviceAuthCode.userCode, userCode),
          eq(deviceAuthCode.status, "pending"),
        ),
      )
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { error: "Code not found or already used." },
        { status: 404 },
      );
    }

    if (new Date() > record.expiresAt) {
      await db
        .update(deviceAuthCode)
        .set({ status: "expired" })
        .where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json(
        { error: "Code has expired. Request a new one." },
        { status: 410 },
      );
    }

    if (action === "deny") {
      await db
        .update(deviceAuthCode)
        .set({ status: "denied", userId })
        .where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json({ status: "denied" });
    }

    // Approve: sign a JWT for the CLI to use as Bearer token
    const token = await signLifeJWT({
      id: userId,
      email: email ?? "",
    });

    await db
      .update(deviceAuthCode)
      .set({
        status: "approved",
        userId,
        sessionToken: token,
      })
      .where(eq(deviceAuthCode.id, record.id));

    return NextResponse.json({
      status: "approved",
      client_id: record.clientId,
    });
  },
);
