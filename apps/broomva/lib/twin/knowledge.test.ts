import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  knowledgeCandidates,
  loadTwinKnowledge,
  resetTwinKnowledgeForTests,
} from "./knowledge";

vi.mock("server-only", () => ({}));

const sample = {
  generatedAt: "2026-11-20T00:00:00.000Z",
  commit: "test",
  documents: [{ id: "projects/life", title: "Life" }],
  graph: { nodes: [], links: [] },
  invertedIndex: {},
};

function workspace(relative: string) {
  const root = mkdtempSync(path.join(tmpdir(), "twin-cwd-"));
  const dir = path.join(root, relative);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "agent-knowledge.json"), JSON.stringify(sample));
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  resetTwinKnowledgeForTests();
});

describe("loadTwinKnowledge", () => {
  it("tries the app directory, then the repo root", () => {
    expect(knowledgeCandidates("/var/task")).toEqual([
      "/var/task/public/agent-knowledge.json",
      "/var/task/apps/broomva/public/agent-knowledge.json",
    ]);
  });

  it.each([
    ["app directory (local dev)", "public"],
    ["repo root (Vercel monorepo function)", "apps/broomva/public"],
  ])("loads from the %s", async (_label, relative) => {
    vi.spyOn(process, "cwd").mockReturnValue(workspace(relative));
    const k = await loadTwinKnowledge();
    expect(k.documents).toHaveLength(1);
  });

  it("falls back to empty knowledge when the file is nowhere", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(
      mkdtempSync(path.join(tmpdir(), "twin-empty-")),
    );
    const k = await loadTwinKnowledge();
    expect(k.documents).toEqual([]);
  });
});
