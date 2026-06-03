import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyMessageMock } = vi.hoisted(() => ({
  verifyMessageMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://test", AUTH_SECRET: "x".repeat(32) },
}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("viem", () => ({
  createPublicClient: () => ({ verifyMessage: verifyMessageMock }),
  http: vi.fn(),
}));
vi.mock("viem/chains", () => ({ base: { id: 8453 } }));

import { validateCrossLink } from "./cross-link";
import { verifyBaseSignature } from "./verify-siwe";

describe("cross-link", () => {
  beforeEach(() => {
    verifyMessageMock.mockReset();
  });

  it.each([
    "used",
    "expired",
    "wrong_user",
    "missing",
  ] as const)("maps nonce validation reason %s to nonce_invalid", (reason) => {
    expect(
      validateCrossLink({
        message: "broomva.tech onchain identity link",
        animaDid: "did:key:z123",
        baseAddress: "0x1234567890abcdef1234567890abcdef12345678",
        nonceValidation: { ok: false, reason },
      }),
    ).toEqual({ ok: false, error: "nonce_invalid" });
  });

  it("rejects when the message omits the authoritative DID", () => {
    expect(
      validateCrossLink({
        message: "Base Account: 0x1234567890abcdef1234567890abcdef12345678",
        animaDid: "did:key:z123",
        baseAddress: "0x1234567890abcdef1234567890abcdef12345678",
        nonceValidation: { ok: true },
      }),
    ).toEqual({ ok: false, error: "did_mismatch" });
  });

  it("rejects when the message omits the authoritative Base address", () => {
    expect(
      validateCrossLink({
        message: "Anima DID: did:key:z123",
        animaDid: "did:key:z123",
        baseAddress: "0x1234567890abcdef1234567890abcdef12345678",
        nonceValidation: { ok: true },
      }),
    ).toEqual({ ok: false, error: "address_mismatch" });
  });

  it("accepts when the nonce is valid and the message embeds both identities", () => {
    expect(
      validateCrossLink({
        message: `broomva.tech onchain identity link
Anima DID: did:key:z123
Base Account: 0x1234567890abcdef1234567890abcdef12345678
Nonce: abcdef1234567890`,
        animaDid: "did:key:z123",
        baseAddress: "0x1234567890abcdef1234567890abcdef12345678",
        nonceValidation: { ok: true },
      }),
    ).toEqual({ ok: true });
  });

  it("returns the mocked successful signature verification result", async () => {
    verifyMessageMock.mockResolvedValueOnce(true);

    await expect(
      verifyBaseSignature({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        message: "hello",
        signature: "0xabcdef",
      }),
    ).resolves.toBe(true);
  });

  it("returns the mocked failed signature verification result", async () => {
    verifyMessageMock.mockResolvedValueOnce(false);

    await expect(
      verifyBaseSignature({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        message: "hello",
        signature: "0xdeadbeef",
      }),
    ).resolves.toBe(false);
  });
});
