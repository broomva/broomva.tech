#!/usr/bin/env node
/**
 * Mint a fresh ES256 P-256 JWK suitable for `LIFEGW_TIER1_SIGNING_JWK`.
 *
 *   $ node scripts/generate-lifegw-tier1-jwk.mjs
 *   {"kty":"EC","crv":"P-256","x":"...","y":"...","d":"...","kid":"...","alg":"ES256","use":"sig"}
 *
 * Operator workflow:
 *
 *   $ KEY=$(node apps/chat/scripts/generate-lifegw-tier1-jwk.mjs)
 *   $ vercel env add LIFEGW_TIER1_SIGNING_JWK production
 *     # paste $KEY when prompted
 *
 * The same key drives:
 *   - JWT signing in `apps/chat/lib/auth/lifegw-jwt.ts`
 *   - JWKS publish at `/api/auth/jwks.json`
 * Rotation: re-run this script + replace the env. lifegw's JwksCache
 * picks up the new `kid` on cache miss (5-minute default TTL); old
 * tokens stay valid until their 15-min `exp` lapses.
 */

import { exportJWK, generateKeyPair } from "jose";
import { createHash } from "node:crypto";

async function main() {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.alg = "ES256";
  jwk.use = "sig";
  // Stable kid derived from public material — operators can rotate by
  // regenerating; the kid moves with the key.
  jwk.kid = createHash("sha256")
    .update(`${jwk.x}.${jwk.y}`)
    .digest("hex")
    .slice(0, 16);
  process.stdout.write(`${JSON.stringify(jwk)}\n`);
}

main().catch((err) => {
  console.error("generate-lifegw-tier1-jwk: failed:", err);
  process.exit(1);
});
