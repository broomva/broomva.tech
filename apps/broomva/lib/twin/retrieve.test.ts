import { describe, expect, it, vi } from "vitest";
import { keywords, retrieveForQuestion } from "./retrieve";

vi.mock("server-only", () => ({}));
vi.mock("./knowledge", () => ({
  loadTwinKnowledge: async () => ({
    generatedAt: "2026-11-20",
    commit: "test",
    documents: [
      doc("projects", "life", "Life", "The Rust Agent OS with Arcan and Lago."),
      doc(
        "writing",
        "control",
        "Control metalayer",
        "Governance as a typed control system for agents.",
      ),
      doc(
        "prompts",
        "agent-prompt",
        "Agent prompt",
        "A Rust agent prompt template for Life.",
      ),
      doc(
        "notes",
        "what",
        "What you are",
        "what are you what you are what is this",
      ),
    ],
    graph: { nodes: [], links: [] },
    invertedIndex: {},
  }),
}));

function doc(kind: string, slug: string, title: string, body: string) {
  return {
    id: `${kind}/${slug}`,
    kind,
    slug,
    title,
    summary: `${title} summary`,
    url: `/${kind}/${slug}`,
    tags: [],
    frontmatter: {},
    body,
    wikilinks: [],
    related: [],
    headings: [],
    wordCount: body.split(" ").length,
  };
}

describe("keywords", () => {
  it("drops English and Spanish function words", () => {
    expect(keywords("What are you working on right now?")).toEqual([
      "working",
      "right",
      "now",
    ]);
    // Two-letter terms ("os") substring-match nearly every document.
    expect(keywords("¿Qué es el Life Agent OS?")).toEqual(["life", "agent"]);
    expect(keywords("who are you")).toEqual([]);
    // Hyphens split (the scorer strips them), duplicates collapse.
    expect(keywords("multi-tenant multi-tenant platforms")).toEqual([
      "multi",
      "tenant",
      "platforms",
    ]);
  });

  it("caps the term count so a long question stays cheap", () => {
    const many = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    expect(keywords(many)).toHaveLength(12);
  });
});

describe("retrieveForQuestion", () => {
  it("returns matching public pages, never prompt templates", async () => {
    const docs = await retrieveForQuestion(
      "Tell me about the Life Rust agent OS",
    );
    expect(docs.map((d) => d.url)).toContain("/projects/life");
    expect(docs.map((d) => d.url)).not.toContain("/prompts/agent-prompt");
    expect(docs[0]).toMatchObject({ title: "Life", url: "/projects/life" });
  });

  it("puts a page the question names by title first", async () => {
    const docs = await retrieveForQuestion(
      "Can you explain your control metalayer idea?",
    );
    expect(docs[0]?.url).toBe("/writing/control");
    expect(docs[0]?.excerpt).toContain("Governance as a typed control system");
  });

  it("drops weak keyword-only matches", async () => {
    // "agents" substring-matches one body once: below MIN_SCORE.
    expect(await retrieveForQuestion("tell me about agents")).toEqual([]);
  });

  it("does not match on stopwords alone", async () => {
    expect(await retrieveForQuestion("what are you")).toEqual([]);
  });
});
