import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getPromptBySlug: vi.fn(),
  updateUserPrompt: vi.fn(),
  softDeleteUserPrompt: vi.fn(),
  getPromptMetrics: vi.fn(),
}));
vi.mock("@/lib/content", () => ({
  getContentBySlug: vi.fn(),
}));
vi.mock("@/lib/prompts/resolve-auth", () => ({
  resolveAuth: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prompts/admin", () => ({
  isAdmin: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/prompts/github-commit", () => ({
  commitPromptToGitHub: vi.fn(),
}));

import { GET, PUT } from "./route";
import {
  getPromptBySlug,
  getPromptMetrics,
  updateUserPrompt,
} from "@/lib/db/queries";
import { getContentBySlug } from "@/lib/content";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { isAdmin } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";

const mockGetPrompt = vi.mocked(getPromptBySlug);
const mockGetMetrics = vi.mocked(getPromptMetrics);
const mockGetContent = vi.mocked(getContentBySlug);
const mockUpdateUserPrompt = vi.mocked(updateUserPrompt);
const mockResolveAuth = vi.mocked(resolveAuth);
const mockIsAdmin = vi.mocked(isAdmin);
const mockCommitToGitHub = vi.mocked(commitPromptToGitHub);

const SLUG = "code-review-agent";

const dbPromptRow = {
  id: "u1",
  userId: "u1",
  slug: SLUG,
  title: "Code Review Agent",
  content: "system prompt body",
  summary: "Structured code review",
  category: "system-prompts",
  model: "claude-sonnet-4.5",
  version: "1.0",
  tags: ["code-review"],
  variables: null,
  links: null,
  visibility: "public" as const,
  createdAt: new Date("2026-05-09T00:00:00Z"),
  updatedAt: new Date("2026-05-09T00:00:00Z"),
  deletedAt: null,
  copyCount: 42,
  isHighlighted: false,
};

const metricsPayload = {
  totals: { copies: 42, cli_pulls: 8, skill_invokes: 30, traces: 80 },
  runs_7d: 12,
  delta_pct: 0,
  last_used_at: "2026-05-09T01:00:00Z",
  avg_latency_ms: 1200,
  avg_cost_usd: 0.01,
  feedback: { thumbs_up: 5, thumbs_down: 0, rate: 1 },
  timeseries: { pass_rate_7d_by_day: null, volume_7d_by_day: [] },
};

function makeReq(query = "") {
  return new Request(`http://localhost/api/prompts/${SLUG}${query}`);
}

describe("GET /api/prompts/[slug]", () => {
  beforeEach(() => {
    mockGetPrompt.mockReset();
    mockGetMetrics.mockReset();
    mockGetContent.mockReset();
  });

  test("DB-prompt path WITHOUT ?include=metrics returns the prompt without metrics", async () => {
    mockGetPrompt.mockResolvedValue(dbPromptRow as never);
    const res = await GET(makeReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("Code Review Agent");
    expect(json.slug).toBe(SLUG);
    expect(json.metrics).toBeUndefined();
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });

  test("DB-prompt path WITH ?include=metrics injects metrics block", async () => {
    mockGetPrompt.mockResolvedValue(dbPromptRow as never);
    mockGetMetrics.mockResolvedValue(metricsPayload as never);
    const res = await GET(makeReq("?include=metrics"), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("Code Review Agent");
    expect(json.metrics).toEqual(metricsPayload);
    expect(mockGetMetrics).toHaveBeenCalledWith(SLUG);
  });

  test("MDX-fallback path WITH ?include=metrics also injects metrics block", async () => {
    mockGetPrompt.mockResolvedValue(undefined);
    mockGetContent.mockResolvedValue({
      slug: SLUG,
      title: "MDX prompt",
      summary: "",
      content: "body",
      html: "",
      date: "2026-05-09",
      tags: [],
      kind: "prompts",
      published: true,
      pinned: false,
    } as never);
    mockGetMetrics.mockResolvedValue(metricsPayload as never);

    const res = await GET(makeReq("?include=metrics"), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("MDX prompt");
    expect(json.metrics).toEqual(metricsPayload);
  });

  test("404 when neither DB nor MDX has the prompt", async () => {
    mockGetPrompt.mockResolvedValue(undefined);
    mockGetContent.mockResolvedValue(null);
    const res = await GET(makeReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/prompts/[slug] — admin GitHub mirror behavior", () => {
  const ADMIN_EMAIL = "admin@example.com";
  const UPDATED_ROW = {
    ...dbPromptRow,
    title: "Updated Title",
  };

  function putReq(): Request {
    return new Request(`http://localhost/api/prompts/${SLUG}`, {
      method: "PUT",
      body: JSON.stringify({ title: "Updated Title" }),
      headers: { "content-type": "application/json" },
    });
  }

  beforeEach(() => {
    mockGetPrompt.mockReset();
    mockUpdateUserPrompt.mockReset();
    mockResolveAuth.mockReset();
    mockIsAdmin.mockReset();
    mockCommitToGitHub.mockReset();

    mockResolveAuth.mockResolvedValue({
      userId: dbPromptRow.userId,
      email: ADMIN_EMAIL,
    } as never);
    mockGetPrompt.mockResolvedValue(dbPromptRow as never);
    mockUpdateUserPrompt.mockResolvedValue(UPDATED_ROW as never);
  });

  test("admin + mirror success → body carries githubMirror.ok=true, no Warning header", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({ success: true } as never);

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror).toEqual({ ok: true });
    expect(res.headers.get("Warning")).toBeNull();
    // Mirror receives the updated DB row, not the request body
    expect(mockCommitToGitHub).toHaveBeenCalledWith(UPDATED_ROW);
  });

  test("admin + mirror FAILURE → body carries githubMirror.ok=false + Warning header", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: "GITHUB_TOKEN not set",
    } as never);

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror).toEqual({
      ok: false,
      error: "GITHUB_TOKEN not set",
    });
    const warning = res.headers.get("Warning");
    expect(warning).toBeTruthy();
    expect(warning).toContain("GitHub mirror failed");
    expect(warning).toContain("GITHUB_TOKEN not set");
  });

  test("non-admin owner update → no mirror, no githubMirror field", async () => {
    mockIsAdmin.mockReturnValue(false);

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror).toBeUndefined();
    expect(mockCommitToGitHub).not.toHaveBeenCalled();
  });

  test("admin + mirror THROWS → caught, 200 + githubMirror.ok=false (DB update preserved)", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockRejectedValue(new Error("ETIMEDOUT"));

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror).toEqual({
      ok: false,
      error: "ETIMEDOUT",
    });
    expect(res.headers.get("Warning")).toContain("ETIMEDOUT");
  });

  test("admin + mirror error with CR/LF/control chars → header sanitized, no 500", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: "GitHub API: 500\n{\"message\":\"oops\"}\r\nx",
    } as never);

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror.ok).toBe(false);
    expect(body.githubMirror.error).toContain("\n"); // body preserves raw
    const warning = res.headers.get("Warning");
    expect(warning).toBeTruthy();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: header sanitization assertion targets RFC 7230 §3.2.6 forbidden range
    expect(warning).not.toMatch(/[\r\n\x00-\x1f\x7f]/);
  });

  test("admin + mirror error with non-ASCII (€/emoji) → header ASCII-safe, no 500", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: "GitHub API: 500 — payment € required 🧪",
    } as never);

    const res = await PUT(putReq(), { params: Promise.resolve({ slug: SLUG }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.githubMirror.error).toContain("🧪");
    const warning = res.headers.get("Warning");
    expect(warning).toBeTruthy();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: assertion bounds header to printable ASCII (Headers ByteString contract)
    expect(warning).toMatch(/^[\x20-\x7e]+$/);
    expect(warning).not.toContain("🧪");
  });
});
