/**
 * lifegw Tier-1 JWT signer + JWKS publish surface.
 *
 * Bridges broomva.tech's Neon Auth identity into the canonical Life
 * Runtime auth chain (Spec C₃ §5.2):
 *
 *   Neon Auth session
 *     ──▶ mintTier1ForConsumer({ consumer, projectSlug })
 *         ──▶ Tier-1 JWT (ES256, kid-pinned, aud=lifegw, iss=https://broomva.tech)
 *             ──▶ wss://lifegw…/v1/agent/stream
 *                 ──▶ lifegw verifies via /api/auth/jwks.json
 *                     ──▶ mints Tier-2 cap (audience=lifed)
 *                         ──▶ lifed dispatches the agent turn
 *
 * Design choices:
 *
 * - **Hand-rolled with `jose`** (already a transitive dep of Better Auth)
 *   instead of mounting Better Auth's JWT plugin. The JWT plugin is
 *   tied to a Better Auth session, but our primary user auth is Neon
 *   Auth — wrapping it in a second Better Auth instance just to reuse
 *   the plugin would be heavyweight. We use the same `jose` primitives
 *   Better Auth uses, with a thin claims layer matching lifegw's
 *   `Tier1Body` schema exactly.
 *
 * - **Per-process random dev key**: in local dev (no env JWK), we
 *   generate an ES256 keypair on first call and cache it for the life
 *   of the process. `bun next dev` runs single-process so the same key
 *   serves both the JWKS endpoint and the mint call. Production
 *   serverless instances would diverge with this scheme, so we throw
 *   when `VERCEL_ENV === "production"` and `LIFEGW_TIER1_SIGNING_JWK`
 *   is unset — operators MUST run `scripts/generate-lifegw-tier1-jwk.mjs`
 *   and set it before deploy.
 *
 * - **15-minute TTL** matches Spec C₃ §5.4's Tier-2 cap cap; Tier-1
 *   tokens MUST be ≤ 15 min so a compromised token has bounded blast
 *   radius. Routes mint a fresh Tier-1 per WS open, never cache.
 *
 * Spec: `apps/chat/docs/superpowers/specs/2026-05-03-life-runtime-canonical.md`
 */

import "server-only";

import { createHash } from "node:crypto";
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  type JWK,
  SignJWT,
} from "jose";

/**
 * `jose` v6 dropped its `SigningKey` re-export. The asymmetric ES256 keys
 * we deal with are always `CryptoKey` (Node ≥ 20 exposes it globally;
 * `jose.generateKeyPair` and `jose.importJWK` both return `CryptoKey`
 * for asymmetric algs). We pin the alias here to keep the rest of the
 * file readable.
 */
type SigningKey = CryptoKey;
import type { ConsumerIdentity } from "@/lib/life-runtime/types";
import type { TierUserCap } from "@/lib/life-runtime/agent-session/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALG = "ES256";
const CRV = "P-256";

/** Default issuer + audience matching lifegw's `lifegw.toml` defaults. */
const DEFAULT_ISSUER = "https://broomva.tech";
const DEFAULT_AUDIENCE = "lifegw";

/** Default token lifetime. Spec C₃ §5.4 caps Tier-2 at 15 min; Tier-1 follows the same posture. */
const DEFAULT_TTL_SECS = 15 * 60;

/** Public JWKS describing the active signing keys. Mirrors RFC 7517. */
export interface PublicJwks {
  keys: Array<{
    kty: "EC";
    crv: typeof CRV;
    x: string;
    y: string;
    use: "sig";
    alg: typeof ALG;
    kid: string;
  }>;
}

interface SignerHandle {
  privateKey: SigningKey;
  publicJwk: PublicJwks["keys"][number];
}

// ---------------------------------------------------------------------------
// Key resolution (production env > deterministic dev fallback)
// ---------------------------------------------------------------------------

/**
 * Lazy singleton — resolved exactly once per process. Both `mint…`
 * and the JWKS route `await getSigner()`.
 */
let signerPromise: Promise<SignerHandle> | null = null;

export async function getSigner(): Promise<SignerHandle> {
  if (!signerPromise) {
    signerPromise = resolveSigner();
  }
  return signerPromise;
}

/** Test seam — wipes the cached signer so per-test env tweaks take effect. */
export function _resetSignerCacheForTests(): void {
  signerPromise = null;
}

async function resolveSigner(): Promise<SignerHandle> {
  const envJwk = process.env.LIFEGW_TIER1_SIGNING_JWK;
  if (envJwk && envJwk.trim().length > 0) {
    return await loadFromEnvJwk(envJwk);
  }

  // No env set — production deploys MUST configure the env so all
  // serverless instances publish the same JWKS. In a single-process
  // local-dev environment a per-process random key is fine because
  // both `/api/auth/jwks.json` and the mint call land on the same
  // instance.
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV) {
    throw new Error(
      "LIFEGW_TIER1_SIGNING_JWK is required in production. Generate one via " +
        "`node scripts/generate-lifegw-tier1-jwk.mjs` and set it on the Vercel project.",
    );
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "LIFEGW_TIER1_SIGNING_JWK must be set on Vercel production env: " +
        "`vercel env add LIFEGW_TIER1_SIGNING_JWK production` " +
        "(serverless instances diverge without a stable shared key).",
    );
  }
  return await ephemeralDevSigner();
}

/** Production path — operator sets a stable ES256 private JWK in env. */
async function loadFromEnvJwk(raw: string): Promise<SignerHandle> {
  let parsed: JWK;
  try {
    parsed = JSON.parse(raw) as JWK;
  } catch (err) {
    throw new Error(
      `LIFEGW_TIER1_SIGNING_JWK is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (parsed.kty !== "EC" || parsed.crv !== CRV) {
    throw new Error(
      `LIFEGW_TIER1_SIGNING_JWK must be EC P-256 (got kty=${parsed.kty} crv=${parsed.crv})`,
    );
  }
  if (!parsed.d) {
    throw new Error("LIFEGW_TIER1_SIGNING_JWK is missing the private key 'd'");
  }
  const privateKey = (await importJWK(parsed, ALG)) as unknown as SigningKey;
  // Strip `d` (private half) before publishing the public JWK.
  const { d: _d, ...publicHalf } = parsed;
  const kid = parsed.kid ?? deriveKid(`${publicHalf.x}.${publicHalf.y}`);
  void _d;
  return {
    privateKey,
    publicJwk: {
      kty: "EC",
      crv: CRV,
      x: publicHalf.x ?? "",
      y: publicHalf.y ?? "",
      use: "sig",
      alg: ALG,
      kid,
    },
  };
}

/**
 * Local-dev fallback — per-process random ES256 keypair.
 *
 * Single-process safety: `bun next dev` keeps both the mint call and
 * the JWKS GET on the same Node instance, so the published JWKS and
 * the signing key always match. Production MUST set
 * `LIFEGW_TIER1_SIGNING_JWK` for serverless-instance consistency.
 */
async function ephemeralDevSigner(): Promise<SignerHandle> {
  const { privateKey } = await generateKeyPair(ALG, { extractable: true });
  const fullJwk = (await exportJWK(privateKey)) as JWK & {
    x: string;
    y: string;
  };
  const kid = deriveKid(`dev:${fullJwk.x}.${fullJwk.y}`);
  return {
    privateKey: privateKey as unknown as SigningKey,
    publicJwk: {
      kty: "EC",
      crv: CRV,
      x: fullJwk.x,
      y: fullJwk.y,
      use: "sig",
      alg: ALG,
      kid,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MintTier1Input {
  consumer: ConsumerIdentity;
  projectSlug: string;
  /**
   * Override token TTL in seconds. Capped to 15 min (Spec §5.4). Used
   * by tests + future explicit-shorter-cap callers.
   */
  ttlSecs?: number;
  /** Override scopes. Default: `["agent:dispatch"]` per lifegw fallback. */
  scopes?: string[];
  /** User plan tier — drives lifegw rate-limiter buckets. Default `"free"`. */
  tier?: "free" | "paid" | "enterprise" | "anon";
}

/**
 * Mint a Tier-1 JWT for a given consumer + project. Returns the compact
 * JWT alongside its expiry epoch (seconds), shaped as a `TierUserCap`
 * so it threads cleanly into `RunInput.capability` and from there to
 * `LifedWsAgentSessionClient.stream({ ..., capability })`.
 */
export async function mintTier1ForConsumer(
  input: MintTier1Input,
): Promise<TierUserCap> {
  const { privateKey, publicJwk } = await getSigner();
  const ttlSecs = clampTtl(input.ttlSecs ?? DEFAULT_TTL_SECS);
  // Use `||` so empty-string env values fall through to defaults — Vercel
  // env edits sometimes land as empty strings rather than unset, and the
  // signer should not silently emit `iss: ""` in that case.
  const issuer = process.env.LIFEGW_TIER1_ISSUER || DEFAULT_ISSUER;
  const audience = process.env.LIFEGW_TIER1_AUDIENCE || DEFAULT_AUDIENCE;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSecs;

  const sub = subjectFromConsumer(input.consumer);
  const tier = input.tier ?? defaultTierForConsumer(input.consumer);
  const scopes = input.scopes ?? ["agent:dispatch"];

  const token = await new SignJWT({
    project_id: input.projectSlug,
    scopes,
    tier,
  })
    .setProtectedHeader({ alg: ALG, typ: "JWT", kid: publicJwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(sub)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, expiresAt: exp };
}

/**
 * Public JWKS — served by `/api/auth/jwks.json`. lifegw's default
 * `auth.jwks_url` points exactly here.
 */
export async function publishJwks(): Promise<PublicJwks> {
  const { publicJwk } = await getSigner();
  return { keys: [publicJwk] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subjectFromConsumer(consumer: ConsumerIdentity): string {
  switch (consumer.kind) {
    case "user":
      return consumer.id;
    case "anon":
      return `anon:${consumer.id}`;
    case "agent":
      return `agent:${consumer.id}`;
  }
}

function defaultTierForConsumer(
  consumer: ConsumerIdentity,
): NonNullable<MintTier1Input["tier"]> {
  if (consumer.kind === "anon") return "anon";
  // Real plan-tier resolution (paid / enterprise) lands when the
  // billing layer threads tenant metadata into `ConsumerIdentity`.
  // For now: every authenticated consumer is `free`.
  return "free";
}

function clampTtl(ttlSecs: number): number {
  // Spec §L4 invariant 4: capability tokens MUST be ≤ 15 minutes.
  if (!Number.isFinite(ttlSecs) || ttlSecs <= 0) {
    return DEFAULT_TTL_SECS;
  }
  return Math.min(Math.floor(ttlSecs), DEFAULT_TTL_SECS);
}

/**
 * Derive a stable `kid` from public material so it's reproducible for
 * tests + so a JWKS rotation moves the kid in lockstep with the key.
 */
function deriveKid(material: string): string {
  return createHash("sha256")
    .update(material)
    .digest("hex")
    .slice(0, 16);
}
