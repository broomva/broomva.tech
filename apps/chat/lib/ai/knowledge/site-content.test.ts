import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __setKnowledgeSourceForTests,
  loadAgentKnowledge,
  readSiteNote,
  resetKnowledgeCacheForTests,
  searchSiteContent,
  traverseFrom,
} from "./site-content";

const FIXTURE = path.join(
  __dirname,
  "__fixtures__",
  "agent-knowledge.fixture.json",
);

describe("site-content loader", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("loads and caches the knowledge JSON", async () => {
    const k1 = await loadAgentKnowledge();
    const k2 = await loadAgentKnowledge();
    expect(k1).toBe(k2); // identity: cache hit
    expect(k1.documents.length).toBe(2);
    expect(k1.graph.nodes.length).toBe(5);
  });

  it("returns empty knowledge when the file is missing", async () => {
    __setKnowledgeSourceForTests("/tmp/definitely-not-here.json");
    resetKnowledgeCacheForTests();
    const k = await loadAgentKnowledge();
    expect(k.documents).toEqual([]);
    expect(k.graph.nodes).toEqual([]);
  });
});

describe("searchSiteContent", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("returns docs matching a single term via inverted index", async () => {
    const results = await searchSiteContent("architecture", { maxResults: 5 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("writing/agent-native-architecture");
  });

  it("ranks title matches above body-only matches", async () => {
    const results = await searchSiteContent("agent", { maxResults: 5 });
    // Both docs contain "agent"; "Agent-Native Architecture" has it in the title
    // so it should outrank "Life Agent OS" which has "Agent" in the middle.
    expect(results[0].id).toBe("writing/agent-native-architecture");
  });

  it("returns empty when no terms match", async () => {
    const results = await searchSiteContent("kubernetes", { maxResults: 5 });
    expect(results).toEqual([]);
  });

  it("respects maxResults", async () => {
    const results = await searchSiteContent("agent", { maxResults: 1 });
    expect(results.length).toBe(1);
  });
});

describe("readSiteNote", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("resolves by id", async () => {
    const note = await readSiteNote("writing/agent-native-architecture");
    expect(note?.title).toBe("Agent-Native Architecture");
  });

  it("resolves by slug", async () => {
    const note = await readSiteNote("agent-native-architecture");
    expect(note?.id).toBe("writing/agent-native-architecture");
  });

  it("resolves by title (case-insensitive)", async () => {
    const note = await readSiteNote("Life Agent OS");
    expect(note?.id).toBe("projects/life-agent-os");
  });

  it("returns null for unknown note", async () => {
    const note = await readSiteNote("nonexistent");
    expect(note).toBeNull();
  });
});

describe("traverseFrom", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("returns 1-hop neighbors via wikilinks", async () => {
    const { seed, neighbors } = await traverseFrom(
      "writing/agent-native-architecture",
      { edgeTypes: ["wikilink"], depth: 1, maxNeighbors: 10 },
    );
    expect(seed?.id).toBe("writing/agent-native-architecture");
    expect(neighbors.map((n) => n.node.id)).toContain("projects/life-agent-os");
  });

  it("filters by edge type", async () => {
    const { neighbors } = await traverseFrom(
      "writing/agent-native-architecture",
      {
        edgeTypes: ["reference"],
        depth: 1,
        maxNeighbors: 10,
      },
    );
    expect(neighbors.map((n) => n.node.id)).not.toContain(
      "projects/life-agent-os",
    );
  });

  it("includes tag neighbors when tag edge type requested", async () => {
    const { neighbors } = await traverseFrom(
      "writing/agent-native-architecture",
      {
        edgeTypes: ["tag"],
        depth: 1,
        maxNeighbors: 10,
      },
    );
    const ids = neighbors.map((n) => n.node.id);
    expect(ids).toContain("tag:agent-os");
    expect(ids).toContain("tag:architecture");
  });

  it("traverses 2 hops", async () => {
    const { neighbors } = await traverseFrom("tag:agent-os", {
      edgeTypes: ["tag", "wikilink"],
      depth: 2,
      maxNeighbors: 20,
    });
    const ids = neighbors.map((n) => n.node.id);
    expect(ids).toContain("writing/agent-native-architecture");
    expect(ids).toContain("projects/life-agent-os");
  });

  it("returns null seed for unknown node", async () => {
    const { seed, neighbors } = await traverseFrom("nope", {
      edgeTypes: ["wikilink"],
      depth: 1,
      maxNeighbors: 10,
    });
    expect(seed).toBeNull();
    expect(neighbors).toEqual([]);
  });
});
