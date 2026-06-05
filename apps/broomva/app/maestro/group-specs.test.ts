import { describe, expect, test } from "vitest";
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";
import {
  activeCount,
  archivedDocs,
  attentionCount,
  claudeDeepLink,
  continuePrompt,
  groupBoardSpecs,
  groupByOrchState,
  ORCH_STATE_META,
  orchSummary,
  viewerHref,
} from "./lib";

function row(over: Partial<SpecDocSummary> = {}): SpecDocSummary {
  return {
    id: "d",
    ownerId: "u",
    handle: "h",
    version: 1,
    state: "published",
    orchState: "proposed",
    altitude: "task",
    dispatchCount: 0,
    title: "T",
    sourceRepo: null,
    sourcePath: null,
    sourceCommit: null,
    ticketId: null,
    prNumber: null,
    sessionId: null,
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

describe("groupBoardSpecs", () => {
  test("groups by state in canonical order (published, draft, archived)", () => {
    const groups = groupBoardSpecs([
      row({ id: "1", state: "archived" }),
      row({ id: "2", state: "published" }),
      row({ id: "3", state: "draft" }),
      row({ id: "4", state: "published" }),
    ]);
    expect(groups.map((g) => g.state)).toEqual([
      "published",
      "draft",
      "archived",
    ]);
    // preserves input order within a group
    expect(groups[0]?.docs.map((d) => d.id)).toEqual(["2", "4"]);
  });

  test("drops empty groups", () => {
    const groups = groupBoardSpecs([row({ state: "draft" })]);
    expect(groups.map((g) => g.state)).toEqual(["draft"]);
  });

  test("empty input → no groups", () => {
    expect(groupBoardSpecs([])).toEqual([]);
  });

  test("unexpected states (superseded/expired) are dropped — never a stray group", () => {
    const groups = groupBoardSpecs([
      row({ id: "s", state: "superseded" }),
      row({ id: "e", state: "expired" }),
    ]);
    expect(groups).toEqual([]);
  });

  test("each group carries its label + hint", () => {
    const [g] = groupBoardSpecs([row({ state: "published" })]);
    expect(g?.label).toBe("Published");
    expect(g?.hint).toContain("/d/<handle>");
  });
});

describe("viewerHref", () => {
  test("active docs → bare handle route", () => {
    expect(
      viewerHref(row({ handle: "alpha", state: "published", version: 2 })),
    ).toBe("/d/alpha");
    expect(
      viewerHref(row({ handle: "alpha", state: "draft", version: 1 })),
    ).toBe("/d/alpha");
  });

  test("archived doc → version-pin route (the bare handle 404s for archived)", () => {
    expect(
      viewerHref(row({ handle: "alpha", state: "archived", version: 3 })),
    ).toBe("/d/alpha/v/3");
  });

  test("falls back to id when handle is null", () => {
    expect(
      viewerHref(row({ handle: null, id: "xyz", state: "published" })),
    ).toBe("/d/xyz");
  });
});

describe("ORCH_STATE_META", () => {
  test("covers all 8 orch-states, each with a label + tone", () => {
    expect(Object.keys(ORCH_STATE_META).sort()).toEqual([
      "blocked",
      "canceled",
      "done",
      "proposed",
      "review",
      "reviewing",
      "running",
      "triggered",
    ]);
    for (const meta of Object.values(ORCH_STATE_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.tone).toBeTruthy();
    }
  });
});

describe("continuePrompt + claudeDeepLink", () => {
  test("continuePrompt pulls the spec via the keystone + the /d URL", () => {
    const p = continuePrompt(row({ handle: "alpha", title: "My Spec" }));
    expect(p).toContain('Continue work on the Broomva spec "My Spec"');
    expect(p).toContain("broomva docs get alpha");
    expect(p).toContain("https://broomva.tech/d/alpha");
    expect(p).toContain("CLAUDE.md / AGENTS.md");
  });

  test("continuePrompt includes source + ticket when present, omits when null", () => {
    const withMeta = continuePrompt(
      row({
        sourcePath: "docs/x.html",
        sourceRepo: "broomva/broomva.tech",
        ticketId: "BRO-1",
      }),
    );
    expect(withMeta).toContain("docs/x.html");
    expect(withMeta).toContain("broomva/broomva.tech");
    expect(withMeta).toContain("BRO-1");
    const bare = continuePrompt(row({ sourcePath: null, ticketId: null }));
    expect(bare).not.toContain("Spec source:");
    expect(bare).not.toContain("Linear ticket:");
  });

  test("claudeDeepLink: claude-cli://open with repo + url-encoded prompt", () => {
    const link = claudeDeepLink(row({ handle: "alpha", sourceRepo: "acme/x" }));
    expect(link.startsWith("claude-cli://open?repo=acme/x&q=")).toBe(true);
    expect(link).toContain("%20"); // spaces in the prompt are encoded
  });

  test("claudeDeepLink defaults repo to broomva/broomva.tech", () => {
    expect(claudeDeepLink(row({ sourceRepo: null }))).toContain(
      "repo=broomva/broomva.tech",
    );
  });
});

describe("mission-control grouping (BRO-1402)", () => {
  const set = [
    row({ id: "a", state: "published", orchState: "proposed" }),
    row({ id: "b", state: "published", orchState: "running" }),
    row({ id: "c", state: "published", orchState: "blocked" }),
    row({ id: "d", state: "published", orchState: "review" }),
    row({ id: "e", state: "draft", orchState: "proposed" }),
    row({ id: "f", state: "archived", orchState: "proposed" }),
  ];

  test("groupByOrchState: attention-first order, active-only, drops empty", () => {
    const groups = groupByOrchState(set);
    expect(groups.map((g) => g.state)).toEqual([
      "blocked",
      "review",
      "running",
      "proposed",
    ]);
    // archived 'f' is NOT folded into proposed — only active a + e
    expect(
      groups
        .find((g) => g.state === "proposed")
        ?.docs.map((x) => x.id)
        .sort(),
    ).toEqual(["a", "e"]);
  });

  test("orchSummary: per-state counts, attention-ordered, non-zero only", () => {
    expect(orchSummary(set).map((s) => [s.state, s.count])).toEqual([
      ["blocked", 1],
      ["review", 1],
      ["running", 1],
      ["proposed", 2],
    ]);
  });

  test("attentionCount: blocked + review among active only", () => {
    expect(attentionCount(set)).toBe(2);
    expect(
      attentionCount([row({ state: "archived", orchState: "blocked" })]),
    ).toBe(0);
  });

  test("activeCount excludes archived; archivedDocs returns only archived", () => {
    expect(activeCount(set)).toBe(5);
    expect(archivedDocs(set).map((x) => x.id)).toEqual(["f"]);
  });
});
