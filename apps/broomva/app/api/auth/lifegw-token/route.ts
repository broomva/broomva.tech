import { NextResponse } from "next/server";
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";

/**
 * POST /api/auth/lifegw-token
 *
 * Refresh endpoint for the ES256 Tier-1 lifegw JWT (BRO-1224).
 *
 * Auth: `Authorization: Bearer <hs256>` — the long-lived Better Auth
 * access token (24h TTL per `JWT_ACCESS_EXPIRY`). This is the same
 * token returned by `/api/auth/device/token` and persisted in
 * `~/.broomva/config.json` as the `token` field.
 *
 * Response (200):
 * ```
 * {
 *   "lifegw_token": "eyJhbGciOiJFUzI1NiIs...",
 *   "lifegw_token_expires_at": 1779400074
 * }
 * ```
 *
 * Key names mirror the CLI deserialization in
 * `crates/broomva-cli/src/api/types.rs:402,406` so the CLI can write
 * the response straight into `~/.broomva/config.json` via
 * `config::store_lifegw_token`.
 *
 * Error responses:
 * - 401 `{ error: "missing_token" }` — no Bearer header
 * - 401 `{ error: "invalid_token" }` — HS256 verify failed (signature,
 *   expiry, issuer, or audience) — caller should re-run `broomva auth
 *   login`
 * - 502 `{ error: "mint_failed", detail: "..." }` — signer / KMS
 *   downstream failure; caller should retry or fall back to interactive
 *   auth
 *
 * Why a dedicated route vs `/api/auth/device/token`:
 * device-token is the RFC 8628 device-code grant, single-use per
 * `device_code`. This route is the refresh grant — long-lived HS256 →
 * short-lived ES256 — so it gets its own endpoint and contract.
 *
 * See Linear BRO-1224 for the full motivation and architecture.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const hs256 = match ? match[1].trim() : "";
  if (!hs256) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const claims = await verifyLifeJWT(hs256);
  if (!claims || !claims.sub) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  try {
    const tier1 = await mintTier1ForConsumer({
      consumer: { kind: "user", id: claims.sub },
      projectSlug: "default",
    });
    return NextResponse.json({
      lifegw_token: tier1.token,
      lifegw_token_expires_at: tier1.expiresAt,
    });
  } catch (err) {
    console.error("[lifegw-token] mint failed:", err);
    return NextResponse.json(
      {
        error: "mint_failed",
        detail:
          process.env.NODE_ENV === "production"
            ? "Tier-1 mint failed; retry or re-authenticate."
            : String(err),
      },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      endpoint: "POST /api/auth/lifegw-token",
      auth: "Authorization: Bearer <hs256-access-token>",
      purpose:
        "Refresh the short-lived ES256 Tier-1 lifegw JWT from the long-lived Better Auth session.",
      response_shape: {
        lifegw_token: "<ES256 JWT>",
        lifegw_token_expires_at: "<epoch seconds>",
      },
    },
    { status: 405 },
  );
}
