import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * POST /api/skills/refresh
 *
 * Manually busts the skills-roster cache so the next render fetches a fresh
 * snapshot from GitHub. Used when a skill ships, is renamed, or its SKILL.md
 * frontmatter changes — without waiting for the natural `cacheLife("hours")`
 * expiry on `lib/github.ts:fetchSkillsFromGitHub`.
 *
 * Auth: gated by a shared secret in the `Authorization: Bearer <SECRET>`
 * header, comparing against `process.env.SKILLS_REFRESH_TOKEN`. Returns 401
 * if the token doesn't match or the env var is unset. This is intentional —
 * leaving the endpoint open would let anyone repeatedly bust the cache and
 * burn the GitHub API rate limit.
 */
export async function POST(request: Request) {
  const expected = process.env.SKILLS_REFRESH_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "SKILLS_REFRESH_TOKEN not configured" },
      { status: 501 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Invalidate the page and any API consumers
  revalidatePath("/skills");
  revalidatePath("/api/skills");

  return NextResponse.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    note: "Next render of /skills will fetch fresh data from GitHub.",
  });
}

export async function GET() {
  return NextResponse.json(
    {
      endpoint: "POST /api/skills/refresh",
      auth: "Authorization: Bearer <SKILLS_REFRESH_TOKEN>",
      purpose:
        "Manually invalidate the cached skills roster so /skills fetches fresh from GitHub.",
    },
    { status: 405 },
  );
}
