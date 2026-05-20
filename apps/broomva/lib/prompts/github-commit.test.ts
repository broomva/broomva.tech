import matter from "gray-matter";
import { describe, expect, test } from "vitest";
import { buildMdx } from "./github-commit";

/**
 * BRO-1182: Regression battery for the silent-MDX-corruption failure mode.
 *
 * The old buildMdx interpolated raw user strings into hand-rolled YAML:
 *
 *   lines.push(`title: "${prompt.title}"`);
 *
 * If `prompt.title` contained `"`, `\`, or `\n`, the resulting frontmatter
 * was invalid YAML. Downstream `gray-matter` (used by `getContentList` in
 * `apps/broomva/lib/content.ts`) silently dropped the frontmatter, so the
 * prompt vanished from the public /prompts page even though the GitHub
 * mirror PUT returned `{ok: true}`. This file locks in the round-trip
 * invariant: every field that buildMdx emits must come back through
 * gray-matter byte-equivalent to what went in.
 */
describe("buildMdx — frontmatter round-trips through gray-matter", () => {
  test("hostile title with quotes, newline, backslash, tab survives round-trip", () => {
    const hostileTitle = 'Test "quoted" \n with backslash \\ and tab \t';
    const mdx = buildMdx({
      title: hostileTitle,
      content: "body text",
    });
    const parsed = matter(mdx);
    expect(parsed.data.title).toBe(hostileTitle);
  });

  test("hostile summary survives round-trip", () => {
    const hostileSummary =
      'Summary with "embedded quotes" and a newline\nand backslash \\ and a single \' quote';
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      summary: hostileSummary,
    });
    const parsed = matter(mdx);
    expect(parsed.data.summary).toBe(hostileSummary);
  });

  test("tags with special characters survive round-trip", () => {
    const hostileTags = [
      'tag with "quotes"',
      "tag\nwith newline",
      "tag: with colon",
      "tag with backslash \\",
      "plain-tag",
    ];
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      tags: hostileTags,
    });
    const parsed = matter(mdx);
    expect(parsed.data.tags).toEqual(hostileTags);
  });

  test("variables with hostile description/default survive round-trip", () => {
    const variables = [
      {
        name: "project_path",
        description: 'Path "with quotes" and \n newline',
        default: ".",
      },
      {
        name: "framework",
        description: "plain text",
        default: 'value with " and \\',
      },
    ];
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      variables,
    });
    const parsed = matter(mdx);
    expect(parsed.data.variables).toEqual(variables);
  });

  test("links with hostile labels survive round-trip", () => {
    const links = [
      { label: 'Spec "v2"', url: "https://example.com/spec" },
      { label: "Plain", url: "https://example.com/plain?q=a&b=c" },
    ];
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      links,
    });
    const parsed = matter(mdx);
    expect(parsed.data.links).toEqual(links);
  });

  test("body content is preserved verbatim (frontmatter delimiter not eaten)", () => {
    // Body content can legally contain `---` (horizontal rules in markdown).
    // gray-matter only consumes the FIRST `---...---` block at the top, so
    // anything below must come back byte-equivalent.
    const body =
      "## Section A\n\nSome text.\n\n---\n\n## Section B\n\nMore text. With \"quotes\" and \\backslash.\n";
    const mdx = buildMdx({
      title: "ok",
      content: body,
    });
    const parsed = matter(mdx);
    // gray-matter normalizes the body — it strips one leading newline after
    // the closing frontmatter delimiter. We constructed mdx as
    // `---\n<yaml>---\n\n<body>\n`, so parsed.content begins with the body.
    expect(parsed.content.trim()).toBe(body.trim());
  });

  test("all fields together — full prompt round-trip", () => {
    const prompt = {
      title: 'Big "Important" Prompt',
      summary: "A summary\nwith newlines and \"quotes\" and \\backslashes",
      content: "# Body\n\nWith content.\n",
      category: "system-prompts",
      model: "claude-sonnet-4.5",
      version: "2.1",
      tags: ["architecture", 'with "quotes"', "multi\nline"],
      variables: [
        {
          name: "x",
          description: 'desc "x"',
          default: "def",
        },
      ],
      links: [{ label: 'lbl "1"', url: "https://example.com" }],
    };
    const mdx = buildMdx(prompt);
    const parsed = matter(mdx);
    expect(parsed.data.title).toBe(prompt.title);
    expect(parsed.data.summary).toBe(prompt.summary);
    expect(parsed.data.category).toBe(prompt.category);
    expect(parsed.data.model).toBe(prompt.model);
    expect(parsed.data.version).toBe(prompt.version);
    expect(parsed.data.tags).toEqual(prompt.tags);
    expect(parsed.data.variables).toEqual(prompt.variables);
    expect(parsed.data.links).toEqual(prompt.links);
    expect(parsed.data.published).toBe(true);
  });

  test("null summary becomes empty string (preserves prior contract)", () => {
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      summary: null,
    });
    const parsed = matter(mdx);
    expect(parsed.data.summary).toBe("");
  });

  test("undefined version defaults to 1.0 (preserves prior contract)", () => {
    const mdx = buildMdx({
      title: "ok",
      content: "body",
    });
    const parsed = matter(mdx);
    expect(parsed.data.version).toBe("1.0");
  });

  test("date field is set to today (YYYY-MM-DD)", () => {
    const mdx = buildMdx({
      title: "ok",
      content: "body",
    });
    const parsed = matter(mdx);
    // gray-matter may parse YYYY-MM-DD strings as Date objects (YAML 1.1).
    const date = parsed.data.date;
    const dateStr =
      date instanceof Date ? date.toISOString().split("T")[0] : String(date);
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateStr).toBe(new Date().toISOString().split("T")[0]);
  });

  test("category/model omitted when not provided (key absent, not empty)", () => {
    const mdx = buildMdx({
      title: "ok",
      content: "body",
    });
    const parsed = matter(mdx);
    expect("category" in parsed.data).toBe(false);
    expect("model" in parsed.data).toBe(false);
  });

  test("variables[].default omitted when falsy (preserves prior truthy contract)", () => {
    // The pre-BRO-1182 implementation emitted `default: "..."` only when
    // `v.default` was truthy. Empty string and undefined alike were dropped.
    // The YAML-serialization migration must NOT widen this contract — it's a
    // bugfix for hostile characters, not a field-surface change.
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      variables: [
        { name: "a", description: "a", default: "" }, // falsy → omitted
        { name: "b", description: "b" }, // missing → omitted
        { name: "c", description: "c", default: "real" }, // truthy → kept
      ],
    });
    const parsed = matter(mdx);
    const variables = parsed.data.variables as Array<Record<string, unknown>>;
    expect(variables[0]).toEqual({ name: "a", description: "a" });
    expect("default" in variables[0]).toBe(false);
    expect(variables[1]).toEqual({ name: "b", description: "b" });
    expect("default" in variables[1]).toBe(false);
    expect(variables[2]).toEqual({
      name: "c",
      description: "c",
      default: "real",
    });
  });

  test("tags/variables/links omitted when array is empty (key absent)", () => {
    const mdx = buildMdx({
      title: "ok",
      content: "body",
      tags: [],
      variables: [],
      links: [],
    });
    const parsed = matter(mdx);
    expect("tags" in parsed.data).toBe(false);
    expect("variables" in parsed.data).toBe(false);
    expect("links" in parsed.data).toBe(false);
  });
});

/**
 * Spot-check that the new buildMdx still produces equivalent semantic output
 * for the kind of well-behaved prompt that the existing 31 MDX files under
 * `content/prompts/` represent — i.e., the migration is data-stable for the
 * happy path, not just hostile inputs.
 */
describe("buildMdx — happy-path semantic stability", () => {
  test("agent-native-architecture-shaped prompt round-trips with key order", () => {
    const prompt = {
      title: "Agent-Native Architecture Analysis",
      summary:
        "Deep architectural analysis prompt for designing apps where frontend state and agent state are unified. The agent is the app; the chat is just one interface.",
      content: "You are a principal architect analyzing a codebase.\n",
      tags: [
        "architecture",
        "agent-native",
        "state-management",
        "design-patterns",
      ],
      category: "system-prompts",
      version: "1.0",
      variables: [
        {
          name: "project_path",
          description: "Path to the project codebase to analyze",
          default: ".",
        },
        {
          name: "framework",
          description: "Frontend framework in use",
          default: "next.js",
        },
      ],
    };
    const mdx = buildMdx(prompt);
    const parsed = matter(mdx);
    expect(parsed.data.title).toBe(prompt.title);
    expect(parsed.data.summary).toBe(prompt.summary);
    expect(parsed.data.tags).toEqual(prompt.tags);
    expect(parsed.data.category).toBe(prompt.category);
    expect(parsed.data.version).toBe(prompt.version);
    expect(parsed.data.variables).toEqual(prompt.variables);
  });
});
