import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the (also-hoisted) `viem` mock factory can reference it without
// hitting the temporal dead zone — `verify-siwe.ts` calls `createPublicClient`
// at module load, which runs the factory before plain `const`s initialize.
const { verifyMessageMock } = vi.hoisted(() => ({
  verifyMessageMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// `@/lib/db/client` transitively imports `@/lib/env`, whose `createEnv` validates
// DATABASE_URL/AUTH_SECRET at module load and throws under the test env. Stub both
// so the pure `validateNonceRow` is importable without a live DB or real env.
vi.mock("@/lib/env", () => ({
  env: { DATABASE_URL: "postgres://test", AUTH_SECRET: "x".repeat(32) },
}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("viem", () => ({
  createPublicClient: () => ({ verifyMessage: verifyMessageMock }),
  http: vi.fn(),
}));
vi.mock("viem/chains", () => ({ base: { id: 8453 } }));

import { validateNonceRow } from "./queries";
import { extractSiweNonce, verifyBaseSignature } from "./verify-siwe";

describe("verify-siwe", () => {
  beforeEach(() => {
    verifyMessageMock.mockReset();
  });

  it("extracts the nonce from an ERC-4361 message", () => {
    const message = `broomva.tech wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

Link this Base Account to your broomva.tech profile.

URI: https://broomva.tech
Version: 1
Chain ID: 8453
Nonce: abcdef1234567890
Issued At: 2026-06-01T00:00:00.000Z`;

    expect(extractSiweNonce(message)).toBe("abcdef1234567890");
  });

  it("returns null when the SIWE message has no nonce line", () => {
    const message = `broomva.tech wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

Version: 1
Chain ID: 8453`;

    expect(extractSiweNonce(message)).toBeNull();
  });

  it("forwards address, message, and signature to viem verification", async () => {
    verifyMessageMock.mockResolvedValueOnce(true);

    await expect(
      verifyBaseSignature({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        message: "hello",
        signature: "0xabcdef",
      }),
    ).resolves.toBe(true);

    expect(verifyMessageMock).toHaveBeenCalledWith({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      message: "hello",
      signature: "0xabcdef",
    });
  });

  it("returns false when viem verification fails", async () => {
    verifyMessageMock.mockResolvedValueOnce(false);

    await expect(
      verifyBaseSignature({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        message: "hello",
        signature: "0xdeadbeef",
      }),
    ).resolves.toBe(false);
  });

  it("accepts a fresh nonce owned by the current user", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const row = {
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date("2026-06-01T12:10:00.000Z"),
    };

    expect(validateNonceRow(row, "user-1", now)).toEqual({ ok: true });
  });

  it("rejects a missing nonce row", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");

    expect(validateNonceRow(undefined, "user-1", now)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("rejects a nonce row owned by another user", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const row = {
      userId: "user-2",
      usedAt: null,
      expiresAt: new Date("2026-06-01T12:10:00.000Z"),
    };

    expect(validateNonceRow(row, "user-1", now)).toEqual({
      ok: false,
      reason: "wrong_user",
    });
  });

  it("rejects a nonce row that was already used", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const row = {
      userId: "user-1",
      usedAt: new Date("2026-06-01T11:59:00.000Z"),
      expiresAt: new Date("2026-06-01T12:10:00.000Z"),
    };

    expect(validateNonceRow(row, "user-1", now)).toEqual({
      ok: false,
      reason: "used",
    });
  });

  it("rejects an expired nonce row", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const row = {
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date("2026-06-01T12:00:00.000Z"),
    };

    expect(validateNonceRow(row, "user-1", now)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
