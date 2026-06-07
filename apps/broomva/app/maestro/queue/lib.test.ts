import { describe, expect, test } from "vitest";
import { densifyDailyBuckets } from "@/lib/db/handoff-buckets";
import type { HandoffSummary } from "@/lib/db/handoff-queries";
import {
  groupQueue,
  handoffContinuePrompt,
  handoffDeepLink,
  mergeTimeline,
  queueSummary,
  relativeTime,
  type TimelineEvent,
  waitingCount,
} from "./lib";

function row(over: Partial<HandoffSummary> = {}): HandoffSummary {
  return {
    id: "h1",
    ownerId: "u",
    slug: "arc",
    version: 1,
    status: "queued",
    visibility: "private",
    publicAt: null,
    unpublishedAt: null,
    priority: 0,
    title: "Arc title",
    tldr: null,
    firstAction: null,
    specRefs: [],
    sourceRepo: null,
    sourcePath: null,
    sourceCommit: null,
    branch: null,
    ticketId: null,
    prNumber: null,
    sessionId: null,
    pickedUpAt: null,
    completedAt: null,
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

describe("groupQueue", () => {
  test("groups by status in flow order (queued, in_progress, done, archived)", () => {
    const groups = groupQueue([
      row({ id: "1", status: "done" }),
      row({ id: "2", status: "queued" }),
      row({ id: "3", status: "in_progress" }),
      row({ id: "4", status: "queued" }),
      row({ id: "5", status: "archived" }),
    ]);
    expect(groups.map((g) => g.status)).toEqual([
      "queued",
      "in_progress",
      "done",
      "archived",
    ]);
    expect(groups[0]?.handoffs.map((h) => h.id)).toEqual(["2", "4"]);
  });

  test("drops empty groups and never surfaces superseded", () => {
    const groups = groupQueue([
      row({ id: "1", status: "queued" }),
      row({ id: "2", status: "superseded" }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(["queued"]);
  });
});

describe("queueSummary + waitingCount", () => {
  test("counts non-zero statuses in flow order", () => {
    const items = queueSummary([
      row({ id: "1", status: "queued" }),
      row({ id: "2", status: "queued" }),
      row({ id: "3", status: "done" }),
    ]);
    expect(items).toEqual([
      expect.objectContaining({ status: "queued", count: 2 }),
      expect.objectContaining({ status: "done", count: 1 }),
    ]);
  });

  test("waitingCount counts only queued", () => {
    expect(
      waitingCount([
        row({ status: "queued" }),
        row({ status: "in_progress" }),
        row({ status: "queued" }),
      ]),
    ).toBe(2);
  });
});

describe("handoffContinuePrompt", () => {
  test("uses explicit firstAction verbatim when present", () => {
    const prompt = handoffContinuePrompt(
      row({ firstAction: "Run `make deploy` and verify the preview." }),
    );
    expect(prompt).toBe("Run `make deploy` and verify the preview.");
  });

  test("synthesizes an orienting prompt with related specs + ticket", () => {
    const prompt = handoffContinuePrompt(
      row({
        title: "Handoff Queue",
        tldr: "Ship the queue.",
        specRefs: ["maestro-handoff-queue", "relay-1b"],
        sourcePath: "docs/handoffs/2026-06-05-queue.md",
        sourceRepo: "broomva/broomva",
        branch: "feat/q",
        ticketId: "BRO-1415",
      }),
    );
    expect(prompt).toContain('Continue the Broomva arc "Handoff Queue".');
    expect(prompt).toContain("Ship the queue.");
    expect(prompt).toContain("broomva docs get maestro-handoff-queue");
    expect(prompt).toContain("/d/relay-1b");
    expect(prompt).toContain("docs/handoffs/2026-06-05-queue.md");
    expect(prompt).toContain("branch feat/q");
    expect(prompt).toContain("Linear ticket: BRO-1415.");
  });
});

describe("handoffDeepLink", () => {
  test("encodes the continue-prompt and defaults the repo", () => {
    const link = handoffDeepLink(row({ firstAction: "do x" }));
    expect(link).toBe("claude-cli://open?repo=broomva/broomva.tech&q=do%20x");
  });
});

describe("mergeTimeline", () => {
  const ev = (id: string, iso: string): TimelineEvent => ({
    id,
    handoffId: "h",
    type: "pushed",
    actor: "cli",
    message: id,
    createdAt: iso,
  });

  test("dedupes by id, sorts newest-first, and caps length", () => {
    const merged = mergeTimeline(
      [ev("a", "2026-06-01T00:00:00Z")],
      [ev("a", "2026-06-01T00:00:00Z"), ev("b", "2026-06-02T00:00:00Z")],
    );
    expect(merged.map((e) => e.id)).toEqual(["b", "a"]);
  });

  test("respects the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      ev(`e${i}`, `2026-06-0${(i % 9) + 1}T00:00:00Z`),
    );
    expect(mergeTimeline([], many, 3)).toHaveLength(3);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-05T12:00:00Z");
  test("formats compact deltas", () => {
    expect(relativeTime("2026-06-05T11:59:40Z", now)).toBe("now");
    expect(relativeTime("2026-06-05T11:30:00Z", now)).toBe("30m");
    expect(relativeTime("2026-06-05T09:00:00Z", now)).toBe("3h");
    expect(relativeTime("2026-06-03T12:00:00Z", now)).toBe("2d");
    expect(relativeTime("2026-05-22T12:00:00Z", now)).toBe("2w");
  });
});

describe("densifyDailyBuckets", () => {
  test("produces a contiguous window oldest→newest with zero-fill", () => {
    const now = new Date("2026-06-05T12:00:00Z");
    const buckets = densifyDailyBuckets(
      new Map([["2026-06-05", 3]]),
      new Map([["2026-06-04", 1]]),
      now,
      3,
    );
    expect(buckets).toEqual([
      { date: "2026-06-03", pushed: 0, completed: 0 },
      { date: "2026-06-04", pushed: 0, completed: 1 },
      { date: "2026-06-05", pushed: 3, completed: 0 },
    ]);
  });
});
