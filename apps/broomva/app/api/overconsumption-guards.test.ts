import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { connection, NextRequest } from "next/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

const LONG_PREFIX = "a".repeat(200);

vi.mock("@/lib/content", () => ({
  getAllSlugs: vi.fn(async (kind: string) => {
    if (kind === "prompts") return ["revoked-prompt"];
    return kind === "writing" ? ["arcan-post"] : [];
  }),
  getContentList: vi.fn(async (kind: string) => {
    if (kind === "writing") {
      return [
        {
          slug: "arcan-post",
          title: `${LONG_PREFIX}UNIQUE_TAIL`,
          summary: "Agent OS runtime",
          tags: ["arcan"],
          date: "2026-11-20",
        },
      ];
    }
    if (kind === "prompts") {
      return [
        {
          slug: "revoked-prompt",
          title: "Revoked Prompt",
          summary: "Should be suppressed",
          tags: ["secret"],
          date: "2026-11-20",
        },
      ];
    }
    return [];
  }),
  getContentBySlug: vi.fn(async (kind: string, slug: string) => ({
    slug,
    title: `${kind}:${slug}`,
    summary: "Summary",
    content: "Body",
    tags: [],
    date: "2026-11-20",
  })),
}));

vi.mock("@/lib/db/queries", () => ({
  getNonPublicPromptSlugs: vi.fn(),
  getPromptBySlugAnyState: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  getSkillsRoster: vi.fn(),
}));

vi.mock("@/lib/url", () => ({ getBaseUrl: () => "https://example.test" }));
vi.mock("@/components/site/page-hero", () => ({ PageHero: () => null }));
vi.mock("@/components/site/prompt-viewer", () => ({ PromptViewer: () => null }));

import { generateMetadata as promptMetadata } from "@/app/(site)/prompts/[slug]/page";
import { GET as llmsFullGET } from "@/app/api/llms-full/route";
import { GET as mdGET } from "@/app/api/md/[kind]/[slug]/route";
import { GET as searchGET } from "@/app/api/search/route";
import { GET as skillDetailGET } from "@/app/api/skills/[slug]/route";
import { GET as skillsGET } from "@/app/api/skills/route";
import sitemap from "@/app/sitemap";
import {
  getNonPublicPromptSlugs,
  getPromptBySlugAnyState,
} from "@/lib/db/queries";
import { getSkillsRoster } from "@/lib/github";

const mockGetSkillsRoster = vi.mocked(getSkillsRoster);
const mockGetNonPublicPromptSlugs = vi.mocked(getNonPublicPromptSlugs);
const mockGetPromptBySlugAnyState = vi.mocked(getPromptBySlugAnyState);

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Extract the top-level `export const maxDuration = <numeric literal>` via the
 * TypeScript AST so comments, non-exported bindings, and scientific notation
 * (e.g. `3e2` -> 300) cannot fool a text regex.
 */
function extractExportedMaxDuration(
  filePath: string,
  sourceText: string,
): number | null {
  const sf = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;
    if ((stmt.declarationList.flags & ts.NodeFlags.Const) === 0) continue;

    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "maxDuration") {
        continue;
      }
      if (!decl.initializer || !ts.isNumericLiteral(decl.initializer)) {
        return Number.NaN;
      }
      return Number(decl.initializer.text);
    }
  }
  return null;
}

const repoRoot = path.resolve(__dirname, "../../../..");
const broomvaApiDir = path.join(repoRoot, "apps/broomva/app/api");
const docsApiDir = path.join(repoRoot, "apps/docs/app/api");

const isAuthRoute = (rel: string) =>
  rel.startsWith("apps/broomva/app/api/auth/");

describe("Vercel overconsumption route invariants", () => {
  it("exports a numeric top-level maxDuration in [1, 30] on every non-auth API route (AST-checked)", () => {
    const allRoutes = [
      ...findRouteFiles(broomvaApiDir),
      ...findRouteFiles(docsApiDir),
    ];
    expect(allRoutes.length).toBeGreaterThan(0);

    for (const fullPath of allRoutes) {
      const rel = path.relative(repoRoot, fullPath);
      if (isAuthRoute(rel)) continue;
      const src = readFileSync(fullPath, "utf8");
      const secs = extractExportedMaxDuration(fullPath, src);
      expect(secs, `${rel} is missing exported numeric maxDuration`).not.toBeNull();
      expect(Number.isFinite(secs), `${rel} maxDuration must be finite`).toBe(true);
      expect(secs, `${rel} maxDuration must be >= 1`).toBeGreaterThanOrEqual(1);
      expect(secs, `${rel} maxDuration must be <= 30`).toBeLessThanOrEqual(30);
    }
  });

  it("AST extractor rejects commented exports and evaluates scientific notation accurately", () => {
    expect(
      extractExportedMaxDuration("fake.ts", "// export const maxDuration = 10;"),
    ).toBeNull();
    expect(
      extractExportedMaxDuration("fake.ts", "export const maxDuration = 3e2;"),
    ).toBe(300);
  });

  describe("runtime Cache-Control & visibility guards on API handlers", () => {
    beforeEach(() => {
      mockGetSkillsRoster.mockReset();
      mockGetNonPublicPromptSlugs.mockReset();
      mockGetPromptBySlugAnyState.mockReset();
    });

    it("GET /api/search enforces the 200-char query cap, suppresses revoked prompts, and CDN-caches non-prompt results", async () => {
      mockGetNonPublicPromptSlugs.mockResolvedValue(["revoked-prompt"]);

      // Exceeds 200 chars with a differing tail: only matches if truncated to 200 chars.
      const res = await searchGET(
        new NextRequest(
          `http://localhost/api/search?q=${LONG_PREFIX}DIFFERENT_TAIL`,
        ),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      );
      const body = await res.json();
      expect(body.results.map((r: { slug: string }) => r.slug)).toEqual([
        "arcan-post",
      ]);

      // Revoked prompt is never returned even on direct query.
      const revokedRes = await searchGET(
        new NextRequest("http://localhost/api/search?q=revoked"),
      );
      const revokedBody = await revokedRes.json();
      expect(revokedBody.results).toEqual([]);
    });

    it("GET /api/search omits prompts and returns private, no-store on DB visibility error", async () => {
      mockGetNonPublicPromptSlugs.mockRejectedValue(new Error("db down"));

      const res = await searchGET(
        new NextRequest("http://localhost/api/search?q=revoked"),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await res.json();
      expect(body.results).toEqual([]);
    });

    it("GET /api/md/prompts/[slug] enforces DB visibility and fails closed on DB error", async () => {
      mockGetPromptBySlugAnyState.mockResolvedValueOnce({
        slug: "revoked-prompt",
        visibility: "private",
        deletedAt: null,
      } as never);
      const privRes = await mdGET(
        new Request("http://localhost/api/md/prompts/revoked-prompt"),
        { params: Promise.resolve({ kind: "prompts", slug: "revoked-prompt" }) },
      );
      expect(privRes.status).toBe(404);
      expect(privRes.headers.get("Cache-Control")).toBe("private, no-store");

      mockGetPromptBySlugAnyState.mockRejectedValueOnce(new Error("db down"));
      const errRes = await mdGET(
        new Request("http://localhost/api/md/prompts/revoked-prompt"),
        { params: Promise.resolve({ kind: "prompts", slug: "revoked-prompt" }) },
      );
      expect(errRes.status).toBe(503);
      expect(errRes.headers.get("Cache-Control")).toBe("private, no-store");

      const writingRes = await mdGET(
        new Request("http://localhost/api/md/writing/arcan-post"),
        { params: Promise.resolve({ kind: "writing", slug: "arcan-post" }) },
      );
      expect(writingRes.status).toBe(200);
      expect(writingRes.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, s-maxage=3600",
      );
    });

    it("generates prompt page metadata only after checking live visibility", async () => {
      const params = Promise.resolve({ slug: "revoked-prompt" });
      mockGetPromptBySlugAnyState
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          visibility: "private",
          deletedAt: null,
        } as never)
        .mockRejectedValueOnce(new Error("db down"));

      await expect(promptMetadata({ params })).resolves.toMatchObject({
        title: "prompts:revoked-prompt",
      });
      await expect(promptMetadata({ params })).resolves.toEqual({
        title: "Prompt not found",
      });
      await expect(promptMetadata({ params })).rejects.toThrow("db down");
      expect(connection).toHaveBeenCalled();
    });

    it("links to the prompt library without publishing mutable entries in static site indexes", async () => {
      const llmsIndex = await (await llmsFullGET()).text();
      expect(llmsIndex).toContain("/writing/arcan-post");
      expect(llmsIndex).toContain("Prompt library");
      expect(llmsIndex).not.toContain("/prompts/revoked-prompt");

      const paths = (await sitemap()).map(({ url }) => new URL(url).pathname);
      expect(paths).toContain("/writing/arcan-post");
      expect(paths).toContain("/prompts");
      expect(paths).not.toContain("/prompts/revoked-prompt");
    });

    it("GET /api/skills caches live responses publicly and marks degraded fallbacks no-store", async () => {
      mockGetSkillsRoster.mockResolvedValueOnce([
        {
          id: "core",
          name: "Core",
          description: "Core layer",
          skills: [
            {
              slug: "bstack",
              name: "bstack",
              description: "Broomva stack",
              source: "github",
            },
          ],
        },
      ] as never);

      const liveRes = await skillsGET(new Request("http://localhost/api/skills"));
      expect(liveRes.status).toBe(200);
      expect(liveRes.headers.get("Cache-Control")).toBe(
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      );

      mockGetSkillsRoster.mockRejectedValueOnce(new Error("GitHub 503"));
      const degradedRes = await skillsGET(
        new Request("http://localhost/api/skills"),
      );
      expect(degradedRes.status).toBe(200);
      expect(degradedRes.headers.get("Cache-Control")).toBe("no-store");
    });

    it("GET /api/skills/[slug] caches live hits publicly, marks degraded fallbacks no-store, and never publicly caches 404", async () => {
      mockGetSkillsRoster.mockResolvedValueOnce([
        {
          id: "core",
          name: "Core",
          description: "Core layer",
          skills: [
            {
              slug: "bstack",
              name: "bstack",
              description: "Broomva stack",
              source: "github",
            },
          ],
        },
      ] as never);

      const liveRes = await skillDetailGET(
        new Request("http://localhost/api/skills/bstack"),
        { params: Promise.resolve({ slug: "bstack" }) },
      );
      expect(liveRes.status).toBe(200);
      expect(liveRes.headers.get("Cache-Control")).toBe(
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      );

      mockGetSkillsRoster.mockRejectedValueOnce(new Error("GitHub 503"));
      const degradedRes = await skillDetailGET(
        new Request("http://localhost/api/skills/bstack"),
        { params: Promise.resolve({ slug: "bstack" }) },
      );
      expect(degradedRes.headers.get("Cache-Control")).toBe("no-store");

      mockGetSkillsRoster.mockResolvedValueOnce([
        { id: "core", name: "Core", description: "Core layer", skills: [] },
      ] as never);
      const missRes = await skillDetailGET(
        new Request("http://localhost/api/skills/does-not-exist"),
        { params: Promise.resolve({ slug: "does-not-exist" }) },
      );
      expect(missRes.status).toBe(404);
      expect(missRes.headers.get("Cache-Control") ?? "").not.toContain("s-maxage");
    });
  });
});
