import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

const repoRoot = path.resolve(__dirname, "../../../..");
const broomvaApiDir = path.join(repoRoot, "apps/broomva/app/api");
const docsApiDir = path.join(repoRoot, "apps/docs/app/api");

// Auth handlers live under /api/auth/* (Better Auth / Neon Auth / device OAuth).
// Every non-auth API route must declare an explicit maxDuration cap (<= 30s)
// so no handler can fall back to the 300s Fluid Compute default ceiling.
const isAuthRoute = (rel: string) =>
  rel.startsWith("apps/broomva/app/api/auth/");

const PUBLIC_CDN_CACHED_ROUTES = [
  "apps/broomva/app/api/search/route.ts",
  "apps/broomva/app/api/skills/route.ts",
  "apps/broomva/app/api/skills/[slug]/route.ts",
  "apps/broomva/app/api/prompts/route.ts",
  "apps/broomva/app/api/prompts/[slug]/route.ts",
  "apps/broomva/app/api/llms/route.ts",
  "apps/broomva/app/api/llms-full/route.ts",
  "apps/broomva/app/api/md/[kind]/[slug]/route.ts",
  "apps/docs/app/api/search/route.ts",
  "apps/docs/app/api/docs-md/[...slug]/route.ts",
];

describe("Vercel overconsumption route invariants", () => {
  it("declares an explicit maxDuration <= 30s on every non-auth API route", () => {
    const allRoutes = [
      ...findRouteFiles(broomvaApiDir),
      ...findRouteFiles(docsApiDir),
    ];
    expect(allRoutes.length).toBeGreaterThan(0);

    for (const fullPath of allRoutes) {
      const rel = path.relative(repoRoot, fullPath);
      if (isAuthRoute(rel)) continue;
      const src = readFileSync(fullPath, "utf8");
      const match = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
      expect(match, `${rel} is missing export const maxDuration`).not.toBeNull();
      const secs = Number(match?.[1]);
      expect(secs, `${rel} maxDuration should be between 1 and 30`).toBeGreaterThanOrEqual(1);
      expect(secs, `${rel} maxDuration should be <= 30`).toBeLessThanOrEqual(30);
    }
  });

  it("sets public CDN Cache-Control (s-maxage) on public read-only API routes", () => {
    for (const rel of PUBLIC_CDN_CACHED_ROUTES) {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");
      expect(src, `${rel} should set Cache-Control`).toContain("Cache-Control");
      expect(src, `${rel} should set s-maxage for CDN caching`).toMatch(
        /public,[^"`'\r\n]*s-maxage=\d+/,
      );
    }
  });
});
