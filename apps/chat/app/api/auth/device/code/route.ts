import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deviceAuthCode } from "@/lib/db/schema";

/**
 * POST /api/auth/device/code
 *
 * RFC 8628 — Device Authorization Request.
 * Returns a device_code, user_code, and verification URI.
 *
 * Body (optional):
 *   { "client_id": "broomva-cli", "scope": "" }
 */
export async function POST(request: Request) {
  try {
    let clientId = "cli";
    let scope = "";

    try {
      const body = await request.json();
      if (body.client_id) clientId = String(body.client_id);
      if (body.scope) scope = String(body.scope);
    } catch {
      // empty body is fine, use defaults
    }

    const deviceCode = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const interval = 5; // seconds

    await db.insert(deviceAuthCode).values({
      deviceCode,
      userCode,
      scope,
      clientId,
      status: "pending",
      expiresAt,
      pollingInterval: interval,
    });

    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3001");

    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${baseUrl}/device`,
      verification_uri_complete: `${baseUrl}/device?code=${userCode}`,
      expires_in: 900,
      interval,
    });
  } catch (error) {
    console.error("Device code request failed:", error);
    return NextResponse.json(
      { error: "internal_error", error_description: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Generate a short, human-friendly code like "ABCD-1234".
 * Avoids ambiguous characters (0/O, 1/I/L).
 */
function generateUserCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(chars, 4)}-${pick(digits, 4)}`;
}
