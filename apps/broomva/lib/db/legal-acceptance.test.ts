import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    AUTH_SECRET: "test-secret",
    ENCRYPTION_KEY: "0".repeat(64),
  },
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
  },
}));

describe("legal acceptance ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the current versions and request evidence", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    mocks.insert.mockReturnValue({ values });

    const { recordCurrentLegalAcceptance } = await import("./legal-acceptance");
    await recordCurrentLegalAcceptance({
      userId: "user-1",
      source: "legal-acceptance-page",
      ipAddress: "203.0.113.8",
      userAgent: "test-agent",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        termsVersion: "2026-08-09",
        privacyVersion: "2026-08-09",
        termsHash:
          "fd429331e1e2604ff5a41abf2dfdb05df607a44e813e0b6b5b0ab7c1fe23766a",
        privacyHash:
          "0c6edd35cb8da4d3aaa1ede053cd03ab2ebbbd6c50c5c93537e22a11340119f4",
        processingAuthorized: true,
        ageConfirmed: true,
        source: "legal-acceptance-page",
        ipAddress: "203.0.113.8",
        userAgent: "test-agent",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.arrayContaining([
        expect.objectContaining({ name: "termsVersion" }),
        expect.objectContaining({ name: "privacyVersion" }),
        expect.objectContaining({ name: "termsHash" }),
        expect.objectContaining({ name: "privacyHash" }),
      ]),
    });
  });

  it("reports whether a current acceptance exists", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "acceptance-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });

    const { hasCurrentLegalAcceptance } = await import("./legal-acceptance");
    await expect(hasCurrentLegalAcceptance("user-1")).resolves.toBe(true);
    expect(limit).toHaveBeenCalledWith(1);
  });
});
