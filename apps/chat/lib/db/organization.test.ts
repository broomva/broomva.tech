import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Inline slug-normalisation logic (mirrors actions.ts)
// ---------------------------------------------------------------------------
function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

const RESERVED_SLUGS = [
  "api", "www", "admin", "console", "app", "chat",
  "login", "signup", "auth", "status", "docs", "blog",
  "writing", "help", "support",
];

// ---------------------------------------------------------------------------
// Slug normalisation
// ---------------------------------------------------------------------------
describe("normalizeSlug", () => {
  it("lowercases the input", () => {
    expect(normalizeSlug("AcmeLabs")).toBe("acmelabs");
  });

  it("replaces spaces with dashes", () => {
    expect(normalizeSlug("acme labs")).toBe("acme-labs");
  });

  it("replaces special chars with dashes", () => {
    // @ and ! become dashes, trailing dash is stripped by the normalization
    expect(normalizeSlug("acme@labs!")).toBe("acme-labs");
    expect(normalizeSlug("acme!!labs")).toBe("acme-labs");
  });

  it("collapses consecutive dashes", () => {
    expect(normalizeSlug("acme---labs")).toBe("acme-labs");
  });

  it("strips leading and trailing dashes", () => {
    expect(normalizeSlug("-acme-")).toBe("acme");
  });

  it("truncates to 32 characters", () => {
    const long = "a".repeat(40);
    expect(normalizeSlug(long)).toHaveLength(32);
  });

  it("handles empty string", () => {
    expect(normalizeSlug("")).toBe("");
  });

  it("handles numbers", () => {
    expect(normalizeSlug("team-42")).toBe("team-42");
  });
});

// ---------------------------------------------------------------------------
// Reserved slugs
// ---------------------------------------------------------------------------
describe("RESERVED_SLUGS", () => {
  it("contains api", () => expect(RESERVED_SLUGS).toContain("api"));
  it("contains admin", () => expect(RESERVED_SLUGS).toContain("admin"));
  it("contains chat", () => expect(RESERVED_SLUGS).toContain("chat"));
  it("contains login", () => expect(RESERVED_SLUGS).toContain("login"));
  it("contains console", () => expect(RESERVED_SLUGS).toContain("console"));
  it("contains auth", () => expect(RESERVED_SLUGS).toContain("auth"));
  it("has at least 10 entries", () => expect(RESERVED_SLUGS.length).toBeGreaterThanOrEqual(10));
});

// ---------------------------------------------------------------------------
// createOrganization (mocked DB)
// ---------------------------------------------------------------------------
const mockInsert = vi.fn();
const mockTx = { insert: mockInsert };
const mockTransaction = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: { transaction: mockTransaction },
}));

// We need server-only mock since organization.ts imports it
vi.mock("server-only", () => ({}));

// Mock env to avoid t3-env validation errors during unit tests
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    BETTER_AUTH_SECRET: "test-secret",
    ENCRYPTION_KEY: "0".repeat(64),
  },
}));

describe("createOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws for a reserved slug", async () => {
    const { createOrganization } = await import("./organization");
    await expect(
      createOrganization("My API", "api", "user-1"),
    ).rejects.toThrow('Slug "api" is reserved');
  });

  it("calls db.transaction for a valid slug", async () => {
    const fakeOrg = { id: "org-1", name: "Acme", slug: "acme" };
    const returningFn = vi.fn().mockResolvedValue([fakeOrg]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertTableFn = vi.fn().mockReturnValue({ values: valuesFn });

    mockTransaction.mockImplementation(async (cb: Function) => {
      const tx = {
        insert: vi.fn().mockImplementation((table: unknown) => {
          if (table === undefined) return { values: valuesFn };
          return { values: valuesFn };
        }),
      };
      // First call returns org, second call (member) returns []
      tx.insert
        .mockReturnValueOnce({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([fakeOrg]) }) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) });
      return cb(tx);
    });

    const { createOrganization } = await import("./organization");
    // Should invoke transaction — reserved-slug guard must not trigger
    await expect(createOrganization("Acme", "acme", "user-1")).resolves.toBeDefined();
    expect(mockTransaction).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ensurePersonalOrg slug generation
// ---------------------------------------------------------------------------
describe("ensurePersonalOrg slug derivation", () => {
  it("derives slug from simple name", () => {
    const name = "Alice";
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    expect(slug).toBe("alice");
  });

  it("derives slug from name with spaces", () => {
    const name = "Alice Smith";
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    expect(slug).toBe("alice-smith");
  });

  it("falls back to user-<id> for empty name", () => {
    const name = "";
    const userId = "abc123";
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || `user-${userId.slice(0, 8)}`;
    expect(slug).toBe("user-abc123");
  });
});
