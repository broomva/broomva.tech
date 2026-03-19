import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deviceAuthCode } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/device/token
 *
 * RFC 8628 — Device Access Token Request.
 * The CLI polls this endpoint until the user approves/denies or the code expires.
 *
 * Body: { "device_code": "...", "grant_type": "urn:ietf:params:oauth:grant-type:device_code" }
 *
 * Responses follow RFC 8628 error codes:
 *   - authorization_pending: user hasn't acted yet
 *   - slow_down: polling too fast (not enforced server-side, advisory)
 *   - access_denied: user denied
 *   - expired_token: code expired
 *   - 200 + { access_token, token_type, expires_in }: approved
 */
export async function POST(request: Request) {
  let deviceCode: string;

  try {
    const body = await request.json();
    deviceCode = body.device_code;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing device_code" },
      { status: 400 }
    );
  }

  if (!deviceCode) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing device_code" },
      { status: 400 }
    );
  }

  const [record] = await db
    .select()
    .from(deviceAuthCode)
    .where(eq(deviceAuthCode.deviceCode, deviceCode))
    .limit(1);

  if (!record) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Unknown device code" },
      { status: 400 }
    );
  }

  // Check expiration
  if (new Date() > record.expiresAt) {
    // Clean up expired record
    await db
      .update(deviceAuthCode)
      .set({ status: "expired" })
      .where(eq(deviceAuthCode.id, record.id));

    return NextResponse.json(
      { error: "expired_token", error_description: "Device code has expired" },
      { status: 400 }
    );
  }

  switch (record.status) {
    case "pending":
      return NextResponse.json(
        {
          error: "authorization_pending",
          error_description: "User has not yet authorized",
        },
        { status: 400 }
      );

    case "denied":
      // Clean up denied record
      await db.delete(deviceAuthCode).where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json(
        { error: "access_denied", error_description: "User denied authorization" },
        { status: 400 }
      );

    case "approved": {
      // Clean up used record
      await db.delete(deviceAuthCode).where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json({
        access_token: record.sessionToken,
        token_type: "Bearer",
        // Session tokens from Better Auth typically last 7 days
        expires_in: 604800,
      });
    }

    default:
      return NextResponse.json(
        { error: "server_error", error_description: "Unexpected state" },
        { status: 500 }
      );
  }
}
