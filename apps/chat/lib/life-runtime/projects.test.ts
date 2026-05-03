// Pure unit tests for the canonical Life-project registry.
//
// These tests are defense in depth on top of the module-load-time validation
// that `defineProjects` already performs. The registry is pure data + a Zod
// schema, so no DB, network, or mocking is needed.
//
// File under test: ./projects.ts

import { describe, expect, it } from "vitest";
import {
  getProjectConfig,
  isProjectSlug,
  listPublicProjects,
  PROJECT_CONFIG_SCHEMA_FOR_TESTS,
  PROJECT_SLUGS,
  PROJECTS,
  type ProjectSlug,
} from "./projects";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
// `vendor/model` shape — matches AI-SDK gateway model ids like
// `openai/gpt-5-mini`, `anthropic/claude-sonnet-4`, etc.
const APP_MODEL_ID_REGEX = /^[^/\s]+\/[^/\s]+$/;
// The current registry only references this tool. When new tools are
// added to `makeLifeToolHandlers`, expand this set.
const KNOWN_TOOL_NAMES = new Set(["note"]);

describe("PROJECTS registry", () => {
  it("is non-empty and PROJECT_SLUGS length matches the registry key count", () => {
    const keys = Object.keys(PROJECTS);
    expect(keys.length).toBeGreaterThan(0);
    expect(PROJECT_SLUGS.length).toBe(keys.length);
    // Order-independent equality: every slug in PROJECT_SLUGS is a key,
    // and vice versa.
    expect(new Set(PROJECT_SLUGS)).toEqual(new Set(keys));
  });

  it("every entry's slug field equals its registry key", () => {
    for (const [key, cfg] of Object.entries(PROJECTS)) {
      expect(cfg.slug).toBe(key);
    }
  });

  it("every entry passes PROJECT_CONFIG_SCHEMA_FOR_TESTS.parse(...)", () => {
    for (const cfg of Object.values(PROJECTS)) {
      // Will throw — and fail the test — if the entry is malformed.
      expect(() => PROJECT_CONFIG_SCHEMA_FOR_TESTS.parse(cfg)).not.toThrow();
    }
  });

  it("every slug matches the kebab-case URL pattern", () => {
    for (const slug of PROJECT_SLUGS) {
      expect(slug, `slug "${slug}"`).toMatch(SLUG_REGEX);
    }
  });
});

describe("isProjectSlug", () => {
  it("returns true for a known slug (sentinel)", () => {
    expect(isProjectSlug("sentinel")).toBe(true);
  });

  it("returns false for an unknown slug", () => {
    expect(isProjectSlug("nonexistent")).toBe(false);
  });

  it("returns false for the empty string", () => {
    expect(isProjectSlug("")).toBe(false);
  });
});

describe("getProjectConfig", () => {
  it("returns the sentinel entry for slug 'sentinel'", () => {
    const cfg = getProjectConfig("sentinel");
    expect(cfg).toBe(PROJECTS.sentinel);
    expect(cfg.slug).toBe("sentinel");
  });

  it("throws when called with a slug that is not in the registry", () => {
    // Force-cast to `ProjectSlug` to bypass the type guard; this is what a
    // buggy caller that skips `isProjectSlug` would look like at runtime.
    expect(() =>
      getProjectConfig("nonexistent" as ProjectSlug),
    ).toThrow(/unknown slug/);
  });
});

describe("listPublicProjects", () => {
  it("returns only entries with visibility === 'public'", () => {
    const publicProjects = listPublicProjects();
    expect(publicProjects.length).toBeGreaterThan(0);
    for (const cfg of publicProjects) {
      expect(cfg.visibility).toBe("public");
    }
    // Sanity: the count matches the public filter applied directly to PROJECTS.
    const expected = Object.values(PROJECTS).filter(
      (p) => p.visibility === "public",
    );
    expect(publicProjects).toHaveLength(expected.length);
  });
});

describe("billing config", () => {
  it("sentinel-paid uses x402 mode at $0.50/run on Base mainnet", () => {
    const cfg = PROJECTS["sentinel-paid"];
    expect(cfg.billing.mode).toBe("x402");
    if (cfg.billing.mode !== "x402") {
      // Type guard for TS — the assertion above already failed if not x402.
      throw new Error("expected x402 billing mode");
    }
    expect(cfg.billing.pricePerRunCents).toBe(50);
    expect(cfg.billing.railChainId).toBe("eip155:8453");
  });
});

describe("defaultModel", () => {
  it("every entry's defaultModel matches the vendor/model pattern", () => {
    for (const cfg of Object.values(PROJECTS)) {
      expect(cfg.defaultModel.length).toBeGreaterThan(0);
      expect(cfg.defaultModel, `defaultModel for "${cfg.slug}"`).toMatch(
        APP_MODEL_ID_REGEX,
      );
    }
  });
});

describe("toolAllowlist", () => {
  it("every entry has a non-empty toolAllowlist of known tools", () => {
    for (const cfg of Object.values(PROJECTS)) {
      expect(cfg.toolAllowlist.length).toBeGreaterThan(0);
      for (const tool of cfg.toolAllowlist) {
        expect(
          KNOWN_TOOL_NAMES.has(tool),
          `tool "${tool}" referenced by "${cfg.slug}" is not in KNOWN_TOOL_NAMES`,
        ).toBe(true);
      }
    }
  });
});

describe("ui.suggestions", () => {
  it("when present, has 1-8 entries with bounded label/prompt lengths", () => {
    let entriesWithSuggestions = 0;
    for (const cfg of Object.values(PROJECTS)) {
      const suggestions = cfg.ui.suggestions;
      if (!suggestions) {
        continue;
      }
      entriesWithSuggestions += 1;
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions.length).toBeLessThanOrEqual(8);
      for (const s of suggestions) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.label.length).toBeLessThanOrEqual(120);
        expect(s.prompt.length).toBeGreaterThan(0);
        expect(s.prompt.length).toBeLessThanOrEqual(2000);
      }
    }
    // At least one entry should ship with suggestions today (sentinel +
    // sentinel-paid). If this drops to zero, the test is no longer checking
    // anything meaningful.
    expect(entriesWithSuggestions).toBeGreaterThan(0);
  });
});

describe("ui.eyebrow", () => {
  it("is unique across all entries (no duplicate breadcrumbs)", () => {
    const eyebrows = Object.values(PROJECTS).map((cfg) => cfg.ui.eyebrow);
    const unique = new Set(eyebrows);
    expect(unique.size).toBe(eyebrows.length);
  });
});
