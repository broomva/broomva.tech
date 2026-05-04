// Unit tests for the lifegw Tier-1 JWT signer.
//
// Covers the round-trip we care about end-to-end:
//
//   1. `mintTier1ForConsumer` produces a JWT that
//      a. has the right header (alg=ES256, typ=JWT, stable kid)
//      b. has the spec'd claims (iss, aud, sub, exp, scopes, project_id, tier)
//      c. verifies against the JWKS published by `publishJwks`
//   2. `publishJwks` returns the expected EC P-256 shape and the kid
//      matches the JWT header's kid.
//   3. The TTL clamp at 15 minutes (Spec C₃ §5.4 cap).
//   4. Subject/tier derivation per consumer kind.
//
// We use the in-process per-process random dev key — no env, no
// `LIFEGW_TIER1_SIGNING_JWK`. That mirrors how `bun next dev` works.
//
// File under test: ./lifegw-jwt.ts

import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  _resetSignerCacheForTests,
  mintTier1ForConsumer,
  publishJwks,
} from "./lifegw-jwt";

beforeEach(() => {
  // Each test gets a fresh signer; the cached promise from the prior
  // test's mint call doesn't bleed env-var changes through.
  _resetSignerCacheForTests();
  vi.stubEnv("LIFEGW_TIER1_SIGNING_JWK", "");
  vi.stubEnv("LIFEGW_TIER1_ISSUER", "");
  vi.stubEnv("LIFEGW_TIER1_AUDIENCE", "");
  vi.stubEnv("VERCEL_ENV", "");
  // Force the dev path; production env-checks throw without a JWK.
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  _resetSignerCacheForTests();
  vi.unstubAllEnvs();
});

describe("mintTier1ForConsumer", () => {
  it("emits a valid ES256 JWT for a user consumer with default claims", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "user_alice" },
      projectSlug: "sentinel",
    });

    expect(cap.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(cap.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // Default 15 min ± a couple seconds for clock drift between the
    // mint and the assertion.
    const now = Math.floor(Date.now() / 1000);
    expect(cap.expiresAt - now).toBeGreaterThan(60 * 14);
    expect(cap.expiresAt - now).toBeLessThanOrEqual(60 * 15 + 2);

    const header = decodeProtectedHeader(cap.token);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("JWT");
    expect(typeof header.kid).toBe("string");
    expect(header.kid).toMatch(/^[a-f0-9]{16}$/);

    const claims = decodeJwt(cap.token);
    expect(claims.iss).toBe("https://broomva.tech");
    expect(claims.aud).toBe("lifegw");
    expect(claims.sub).toBe("user_alice");
    expect(claims.exp).toBe(cap.expiresAt);
    expect(claims.iat).toBeLessThanOrEqual(claims.exp ?? 0);
    expect(claims.nbf).toBe(claims.iat);
    // Custom claims forwarded into Tier1Body.
    expect((claims as Record<string, unknown>).project_id).toBe("sentinel");
    expect((claims as Record<string, unknown>).scopes).toEqual([
      "agent:dispatch",
    ]);
    expect((claims as Record<string, unknown>).tier).toBe("free");
  });

  it("uses `anon:<id>` as subject and tier=anon for anon consumers", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "anon", id: "session-xyz" },
      projectSlug: "sentinel",
    });
    const claims = decodeJwt(cap.token);
    expect(claims.sub).toBe("anon:session-xyz");
    expect((claims as Record<string, unknown>).tier).toBe("anon");
  });

  it("uses `agent:<wallet>` as subject for x402-style agents", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "agent", id: "0xdeadbeef" },
      projectSlug: "sentinel-paid",
    });
    const claims = decodeJwt(cap.token);
    expect(claims.sub).toBe("agent:0xdeadbeef");
    expect((claims as Record<string, unknown>).tier).toBe("free");
  });

  it("clamps TTL to 15 minutes max even when the caller asks for more", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
      ttlSecs: 60 * 60, // 1 hour requested
    });
    const now = Math.floor(Date.now() / 1000);
    expect(cap.expiresAt - now).toBeLessThanOrEqual(60 * 15 + 2);
  });

  it("ignores zero / negative / NaN TTLs and falls back to 15 min", async () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cap = await mintTier1ForConsumer({
        consumer: { kind: "user", id: "u" },
        projectSlug: "sentinel",
        ttlSecs: bad,
      });
      const now = Math.floor(Date.now() / 1000);
      expect(cap.expiresAt - now).toBeGreaterThan(60 * 14);
    }
  });

  it("honours explicit scopes + tier overrides", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
      scopes: ["agent:read", "wallet:transfer"],
      tier: "enterprise",
    });
    const claims = decodeJwt(cap.token);
    expect((claims as Record<string, unknown>).scopes).toEqual([
      "agent:read",
      "wallet:transfer",
    ]);
    expect((claims as Record<string, unknown>).tier).toBe("enterprise");
  });

  it("respects LIFEGW_TIER1_ISSUER / LIFEGW_TIER1_AUDIENCE overrides", async () => {
    vi.stubEnv("LIFEGW_TIER1_ISSUER", "https://staging.broomva.tech");
    vi.stubEnv("LIFEGW_TIER1_AUDIENCE", "lifegw-staging");
    _resetSignerCacheForTests();

    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
    });
    const claims = decodeJwt(cap.token);
    expect(claims.iss).toBe("https://staging.broomva.tech");
    expect(claims.aud).toBe("lifegw-staging");
  });
});

describe("publishJwks", () => {
  it("returns an EC P-256 public JWKS matching the mint's kid", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
    });
    const jwks = await publishJwks();
    expect(jwks.keys).toHaveLength(1);
    const [key] = jwks.keys;
    expect(key.kty).toBe("EC");
    expect(key.crv).toBe("P-256");
    expect(key.alg).toBe("ES256");
    expect(key.use).toBe("sig");
    expect(key.x).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key.y).toMatch(/^[A-Za-z0-9_-]+$/);

    // The published kid must match the JWT header — same key, same kid.
    const header = decodeProtectedHeader(cap.token);
    expect(key.kid).toBe(header.kid);
  });

  it("does NOT leak the private 'd' field in the JWKS", async () => {
    const jwks = await publishJwks();
    const raw = JSON.stringify(jwks);
    expect(raw).not.toMatch(/"d"\s*:/);
  });
});

describe("end-to-end: jwks ↔ mint round-trip", () => {
  it("verifies a freshly-minted JWT against the freshly-published JWKS", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "user_alice" },
      projectSlug: "sentinel",
    });
    const jwks = await publishJwks();

    const publicKey = await importJWK(jwks.keys[0], "ES256");
    const { payload } = await jwtVerify(cap.token, publicKey, {
      issuer: "https://broomva.tech",
      audience: "lifegw",
    });
    expect(payload.sub).toBe("user_alice");
    expect(payload.exp).toBe(cap.expiresAt);
  });

  it("fails verification when audience is wrong", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
    });
    const jwks = await publishJwks();
    const publicKey = await importJWK(jwks.keys[0], "ES256");

    await expect(
      jwtVerify(cap.token, publicKey, {
        issuer: "https://broomva.tech",
        audience: "different-audience",
      }),
    ).rejects.toThrow();
  });

  it("fails verification when issuer is wrong", async () => {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: "u" },
      projectSlug: "sentinel",
    });
    const jwks = await publishJwks();
    const publicKey = await importJWK(jwks.keys[0], "ES256");

    await expect(
      jwtVerify(cap.token, publicKey, {
        issuer: "https://evil.example.com",
        audience: "lifegw",
      }),
    ).rejects.toThrow();
  });
});
