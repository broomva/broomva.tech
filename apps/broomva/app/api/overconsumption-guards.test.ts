import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/content", () => ({
  getContentList: vi.fn(async (kind: string) =>
    kind === "writing"
      ? [
          {
            slug: "arcan-post",
            title: "Arcan Runtime",
            summary: "Agent OS runtime",
            tags: ["arcan"],
            date: "2026-11-20",
          },
        ]
      : [],
  ),
}));

vi.mock("@/lib/github", () => ({
  getSkillsRoster: vi.fn(),
}));

import { GET as searchGET } from "@/app/api/search/route";
import { GET as skillDetailGET } from "@/app/api/skills/[slug]/route";
import { GET as skillsGET } from "@/app/api/skills/route";
import { getSkillsRoster } from "@/lib/github";

const mockGetSkillsRoster = vi.mocked(getSkillsRoster);

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

  describe("runtime Cache-Control headers on public read-only handlers", () => {
    beforeEach(() => {
      mockGetSkillsRoster.mockReset();
    });

    it("GET /api/search returns public CDN Cache-Control and caps query length", async () => {
      const longQuery = "a".repeat(500);
      const res = await searchGET(
        new NextRequest(`http://localhost/api/search?q=${longQuery}`),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      );
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
