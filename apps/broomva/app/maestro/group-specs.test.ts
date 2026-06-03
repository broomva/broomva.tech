import { describe, expect, test } from "vitest";
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";
import { groupBoardSpecs } from "./lib";

function row(over: Partial<SpecDocSummary> = {}): SpecDocSummary {
  return {
    id: "d",
    ownerId: "u",
    handle: "h",
    version: 1,
    state: "published",
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
  } as SpecDocSummary;
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
