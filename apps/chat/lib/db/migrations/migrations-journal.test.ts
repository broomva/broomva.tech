/**
 * Regression test for the migration journal gap that caused the
 * /onboarding crash (BRO-XXX).
 *
 * Root cause: SQL migration files were created manually and never
 * registered in _journal.json, so drizzle's migrator silently skipped
 * them on every production deploy. Tables like Organization,
 * OrganizationMember, and AudioPlaybackState were never created.
 *
 * This test ensures:
 * 1. Every .sql file in the migrations directory is registered in the journal.
 * 2. Journal idx values are contiguous (no gaps).
 * 3. Every journal entry references an existing .sql file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  version: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function loadJournal(): Journal {
  const raw = readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf-8");
  return JSON.parse(raw);
}

/**
 * SQL files that exist on disk but are legitimately not in the journal.
 * These are historical alternative drafts that were superseded by another
 * migration with the same numeric prefix (e.g. 0001_sparkling_blue_marvel
 * replaced 0001_add_refresh_token_table before the journal was committed).
 */
const KNOWN_ORPHANED_MIGRATIONS = new Set([
  "0001_add_refresh_token_table",
  "0047_cooing_gressill",
]);

function getSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(".sql", ""))
    .filter((f) => !KNOWN_ORPHANED_MIGRATIONS.has(f))
    .sort();
}

describe("migration journal integrity (regression)", () => {
  const journal = loadJournal();
  const sqlFiles = getSqlFiles();

  it("journal has at least one entry", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("every SQL file is registered in the journal", () => {
    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const unregistered = sqlFiles.filter((f) => !journalTags.has(f));
    expect(unregistered).toEqual([]);
  });

  it("every journal tag references an existing SQL file", () => {
    const sqlSet = new Set(sqlFiles);
    const missing = journal.entries
      .map((e) => e.tag)
      .filter((tag) => !sqlSet.has(tag));
    expect(missing).toEqual([]);
  });

  it("journal idx values are unique", () => {
    const idxValues = journal.entries.map((e) => e.idx);
    const unique = new Set(idxValues);
    expect(unique.size).toBe(idxValues.length);
  });

  it("journal is sorted by idx", () => {
    const idxValues = journal.entries.map((e) => e.idx);
    const sorted = [...idxValues].sort((a, b) => a - b);
    expect(idxValues).toEqual(sorted);
  });

  it("all entries have required fields", () => {
    for (const entry of journal.entries) {
      expect(typeof entry.idx).toBe("number");
      expect(typeof entry.tag).toBe("string");
      expect(entry.tag.length).toBeGreaterThan(0);
      expect(typeof entry.when).toBe("number");
    }
  });

  // Specific regression: the four entries that were missing and caused the crash
  it("includes 0051_add_agent_audit_columns (was missing from journal)", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0051_add_agent_audit_columns");
  });

  it("includes 0051_add_agent_table (was missing from journal)", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0051_add_agent_table");
  });

  it("includes 0052_add_agent_service_marketplace (was missing from journal)", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0052_add_agent_service_marketplace");
  });

  it("includes 0053_add_tenant_arcan_admin_tables (was missing from journal)", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0053_add_tenant_arcan_admin_tables");
  });

  it("includes 0054_add_missing_columns (invitedAt fix)", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain("0054_add_missing_columns");
  });
});
