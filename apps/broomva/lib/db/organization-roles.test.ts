import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    AUTH_SECRET: "test-secret",
    ENCRYPTION_KEY: "0".repeat(64),
  },
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: mocks.select },
}));

function mockRole(role: "owner" | "admin" | "member" | undefined) {
  const limit = vi.fn().mockResolvedValue(role ? [{ role }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

describe("hasOrganizationRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["owner", "admin"] as const)("allows a billing %s", async (role) => {
    mockRole(role);
    const { hasOrganizationRole } = await import("./organization");
    await expect(
      hasOrganizationRole("user-1", "org-1", ["owner", "admin"]),
    ).resolves.toBe(true);
  });

  it("rejects an ordinary member", async () => {
    mockRole("member");
    const { hasOrganizationRole } = await import("./organization");
    await expect(
      hasOrganizationRole("user-1", "org-1", ["owner", "admin"]),
    ).resolves.toBe(false);
  });
});
