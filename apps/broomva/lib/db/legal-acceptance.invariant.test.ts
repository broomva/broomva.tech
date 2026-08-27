/**
 * The coupling between `legal.ts` and this ledger is the thing that has no test.
 *
 * `legal.test.ts` FORCES a new content hash whenever the rendered policy changes
 * ("requires a new Terms hash when rendered policy inputs change"). This ledger
 * then treats the hash as part of acceptance identity. Put together: any edit to
 * a policy page — including one the author judges legally immaterial — strands
 * every acceptance row already on disk, and `lib/proxy.ts` denies those users.
 *
 * That consequence is a real property of the design. It is not asserted anywhere,
 * which is how BRO-2184 (#283) shipped a comment reading "no re-acceptance is
 * forced" directly above a change to both hashes.
 *
 * These tests do not take a position on whether hashes SHOULD gate acceptance.
 * They make the coupling visible at the point where someone edits a constant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    AUTH_SECRET: "test-secret",
    ENCRYPTION_KEY: "0".repeat(64),
  },
}));
vi.mock("@/lib/db/client", () => ({
  db: { insert: mocks.insert, select: mocks.select },
}));

/** Collect the column names a drizzle SQL condition tree filters on. */
function filterColumns(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const child of node) filterColumns(child, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  const n = node as Record<string, unknown>;
  if (typeof n.name === "string" && n.columnType) out.push(n.name);
  if (Array.isArray(n.queryChunks)) filterColumns(n.queryChunks, out, depth + 1);
  return out;
}

/** The columns that together identify one acceptance. */
const ACCEPTANCE_IDENTITY = [
  "termsVersion",
  "privacyVersion",
  "termsHash",
  "privacyHash",
] as const;

describe("legal acceptance invalidation contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches a current acceptance on both content hashes, not on versions alone", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });

    const { hasCurrentLegalAcceptance } = await import("./legal-acceptance");
    await hasCurrentLegalAcceptance("user-1");

    const cols = filterColumns(
      (where.mock.calls[0]?.[0] as { queryChunks?: unknown })?.queryChunks,
    );

    // If either hash drops out of this predicate, editing a policy stops
    // logging everyone out — a behaviour change that must be deliberate.
    for (const column of ACCEPTANCE_IDENTITY) {
      expect(cols).toContain(column);
    }
    expect(cols).toContain("userId");
  });

  it("writes the same identity columns it later matches on", async () => {
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

    const written = values.mock.calls[0]?.[0] as Record<string, unknown>;

    // Recorded identity and matched identity must be the same set, or a row can
    // be written that the predicate can never match.
    for (const column of ACCEPTANCE_IDENTITY) {
      expect(written).toHaveProperty(column);
      expect(typeof written[column]).toBe("string");
    }
  });
});
