import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/lifegw-jwt", () => ({
  mintTier1ForConsumer: vi.fn(),
}));

vi.mock("@/lib/ai/vault/jwt", () => ({
  verifyLifeJWT: vi.fn(),
}));

import { POST, GET } from "./route";
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";

const mockMint = vi.mocked(mintTier1ForConsumer);
const mockVerify = vi.mocked(verifyLifeJWT);

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/lifegw-token", {
    method: "POST",
    headers,
  });
}

describe("POST /api/auth/lifegw-token", () => {
  beforeEach(() => {
    mockMint.mockReset();
    mockVerify.mockReset();
  });

  test("200 — valid HS256 → mints + returns Tier-1 in snake_case keys", async () => {
    mockVerify.mockResolvedValue({ sub: "user-abc", email: "a@b.com" });
    mockMint.mockResolvedValue({
      token: "eyJalg.tier1.token",
      expiresAt: 1779400000,
      kid: "kid-1",
    } as never);

    const resp = await POST(makeReq({ authorization: "Bearer hs256.valid.token" }));

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({
      lifegw_token: "eyJalg.tier1.token",
      lifegw_token_expires_at: 1779400000,
    });

    expect(mockVerify).toHaveBeenCalledWith("hs256.valid.token");
    expect(mockMint).toHaveBeenCalledWith({
      consumer: { kind: "user", id: "user-abc" },
      projectSlug: "default",
    });
  });

  test("401 missing_token — no Authorization header", async () => {
    const resp = await POST(makeReq({}));

    expect(resp.status).toBe(401);
    expect(await resp.json()).toEqual({ error: "missing_token" });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  test("401 missing_token — empty Bearer (just the word)", async () => {
    const resp = await POST(makeReq({ authorization: "Bearer " }));

    expect(resp.status).toBe(401);
    expect(await resp.json()).toEqual({ error: "missing_token" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("401 invalid_token — verifyLifeJWT returns null (bad signature)", async () => {
    mockVerify.mockResolvedValue(null);

    const resp = await POST(makeReq({ authorization: "Bearer hs256.bad.sig" }));

    expect(resp.status).toBe(401);
    expect(await resp.json()).toEqual({ error: "invalid_token" });
    expect(mockMint).not.toHaveBeenCalled();
  });

  test("401 invalid_token — verifyLifeJWT returns claims without sub", async () => {
    // Defensive: shouldn't happen per verifyLifeJWT's contract, but
    // belt-and-braces in case the contract drifts.
    mockVerify.mockResolvedValue({ sub: "", email: "x@y.z" });

    const resp = await POST(makeReq({ authorization: "Bearer hs256.no.sub" }));

    expect(resp.status).toBe(401);
    expect(await resp.json()).toEqual({ error: "invalid_token" });
    expect(mockMint).not.toHaveBeenCalled();
  });

  test("502 mint_failed — signer/KMS downstream error", async () => {
    mockVerify.mockResolvedValue({ sub: "user-abc", email: "a@b.com" });
    mockMint.mockRejectedValue(new Error("signer unavailable"));

    const resp = await POST(makeReq({ authorization: "Bearer hs256.valid.token" }));

    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error).toBe("mint_failed");
    expect(body.detail).toBeDefined();
  });

  test("case-insensitive Bearer prefix", async () => {
    mockVerify.mockResolvedValue({ sub: "user-abc", email: "a@b.com" });
    mockMint.mockResolvedValue({
      token: "tier1",
      expiresAt: 1779400000,
      kid: "kid-1",
    } as never);

    const resp = await POST(makeReq({ authorization: "bearer hs256.valid.token" }));

    expect(resp.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith("hs256.valid.token");
  });
});

describe("GET /api/auth/lifegw-token", () => {
  test("405 with usage hint", async () => {
    const resp = await GET();
    expect(resp.status).toBe(405);
    const body = await resp.json();
    expect(body.endpoint).toBe("POST /api/auth/lifegw-token");
    expect(body.purpose).toContain("Refresh");
  });
});
