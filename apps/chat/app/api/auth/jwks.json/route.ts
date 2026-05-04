/**
 * GET /api/auth/jwks.json
 *
 * Publishes the public half of the lifegw Tier-1 signing key so lifegw
 * can verify Tier-1 JWTs minted by `mintTier1ForConsumer()`. Path is
 * the canonical default referenced by lifegw's `auth.jwks_url` config
 * — see `core/life/crates/life-runtime/lifegw/src/config.rs`
 * (`default_jwks_url() = "https://broomva.tech/api/auth/jwks.json"`).
 *
 * Cache headers match lifegw's default JWKS cache TTL (5 minutes,
 * `default_jwks_cache_ttl()`). The 30-min `s-maxage` lets the Vercel
 * edge cache serve repeat lifegw fetches without round-tripping the
 * function.
 */

import { NextResponse } from "next/server";
import { publishJwks } from "@/lib/auth/lifegw-jwt";

// Route segment config (dynamic / runtime) intentionally omitted —
// `nextConfig.cacheComponents` rejects them. The handler is a vanilla
// Node-runtime route by default, which matches our needs (lifegw fetches
// this endpoint with a 5-min JwksCache TTL, so cold-start latency is
// not a hot path).

export async function GET(): Promise<NextResponse> {
  try {
    const jwks = await publishJwks();
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        "Content-Type": "application/jwk-set+json",
        // Match lifegw's `default_jwks_cache_ttl` of 5 min, with a
        // permissive Vercel-edge `s-maxage` so cache hits don't run the
        // function. lifegw refetches on `kid` cache miss anyway.
        "Cache-Control":
          "public, max-age=300, s-maxage=1800, must-revalidate",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/auth/jwks.json] failed to publish JWKS:", err);
    return NextResponse.json(
      { error: "Failed to publish JWKS", detail: message },
      { status: 500 },
    );
  }
}
