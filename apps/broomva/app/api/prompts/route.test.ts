import { describe, expect, test, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getAllPublicPrompts: vi.fn(),
  getMetricsForSlugs: vi.fn(),
  createUserPrompt: vi.fn(),
  getPromptBySlug: vi.fn(),
}));

vi.mock("@/lib/content", () => ({
  getContentList: vi.fn(),
}));

vi.mock("@/lib/prompts/resolve-auth", () => ({
  resolveAuth: vi.fn(),
}));

vi.mock("@/lib/prompts/admin", () => ({
  isAdmin: vi.fn(() => false),
  generateSlug: vi.fn((t: string) => t.toLowerCase().replace(/\s+/g, "-")),
}));

vi.mock("@/lib/prompts/github-commit", () => ({
  commitPromptToGitHub: vi.fn(),
}));

import { GET, POST } from "./route";
import {
  getAllPublicPrompts,
  getMetricsForSlugs,
  createUserPrompt,
  getPromptBySlug,
} from "@/lib/db/queries";
import { getContentList } from "@/lib/content";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { isAdmin } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";

const mockGetAll = vi.mocked(getAllPublicPrompts);
const mockGetMetrics = vi.mocked(getMetricsForSlugs);
const mockGetContentList = vi.mocked(getContentList);
const mockCreateUserPrompt = vi.mocked(createUserPrompt);
const mockGetPromptBySlug = vi.mocked(getPromptBySlug);
const mockResolveAuth = vi.mocked(resolveAuth);
const mockIsAdmin = vi.mocked(isAdmin);
const mockCommitToGitHub = vi.mocked(commitPromptToGitHub);

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/prompts${qs ? `?${qs}` : ""}`);
}

const DB_PROMPT = {
  id: "id-1",
  userId: "u1",
  slug: "code-review-agent",
  title: "Code Review Agent",
  summary: "A code review agent",
  content: "system: code review",
  category: "engineering",
  tags: ["code", "review"],
  links: [],
  model: "claude",
  version: "1.0",
  variables: null,
  visibility: "public" as const,
  copyCount: 0,
  isHighlighted: false,
  deletedAt: null,
  createdAt: new Date("2026-05-10T00:00:00Z"),
  updatedAt: new Date("2026-05-10T00:00:00Z"),
};

const MDX_ENTRY = {
  title: "Refactor Helper",
  summary: "MDX prompt",
  date: "2026-05-09T00:00:00.000Z",
  slug: "refactor-helper",
  kind: "prompts" as const,
  published: true,
  pinned: false,
  tags: [],
  links: [],
};

describe("GET /api/prompts", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockGetMetrics.mockReset();
    mockGetContentList.mockReset();

    mockGetAll.mockResolvedValue([DB_PROMPT] as never);
    mockGetContentList.mockResolvedValue([MDX_ENTRY] as never);
    mockGetMetrics.mockResolvedValue(
      new Map([
        [
          "code-review-agent",
          {
            copies: 10,
            cli_pulls: 2,
            skill_invokes: 50,
            traces: 62,
            runs_7d: 62,
          },
        ],
        [
          "refactor-helper",
          {
            copies: 3,
            cli_pulls: 5,
            skill_invokes: 1,
            traces: 9,
            runs_7d: 9,
          },
        ],
      ]),
    );
  });

  test("200 — no ?include returns merged list without metrics", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].metrics).toBeUndefined();
    expect(body[1].metrics).toBeUndefined();
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });

  test("200 — ?include=metrics enriches each entry with metrics", async () => {
    const res = await GET(makeReq("include=metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    const found = body.find((b: { slug: string }) => b.slug === "code-review-agent");
    expect(found.metrics).toBeDefined();
    expect(found.metrics.skill_invokes).toBe(50);
    expect(mockGetMetrics).toHaveBeenCalledOnce();
  });

  test("200 — ?include=metrics&sort=skill_invokes orders by metric desc", async () => {
    const res = await GET(makeReq("include=metrics&sort=skill_invokes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].slug).toBe("code-review-agent");
    expect(body[1].slug).toBe("refactor-helper");
  });
});

describe("POST /api/prompts — admin GitHub mirror behavior", () => {
  const ADMIN_EMAIL = "admin@example.com";
  const USER_ID = "user-1";

  const POST_BODY = {
    title: "Test Prompt",
    content: "system: hello",
    summary: "A test prompt",
    category: "agent-instructions",
  };

  const CREATED_ROW = {
    ...DB_PROMPT,
    slug: "test-prompt",
    title: POST_BODY.title,
    content: POST_BODY.content,
    summary: POST_BODY.summary,
    category: POST_BODY.category,
    userId: USER_ID,
  };

  function postReq(): NextRequest {
    return new NextRequest("http://localhost/api/prompts", {
      method: "POST",
      body: JSON.stringify(POST_BODY),
      headers: { "content-type": "application/json" },
    });
  }

  beforeEach(() => {
    mockResolveAuth.mockReset();
    mockIsAdmin.mockReset();
    mockCommitToGitHub.mockReset();
    mockCreateUserPrompt.mockReset();
    mockGetPromptBySlug.mockReset();

    mockResolveAuth.mockResolvedValue({
      userId: USER_ID,
      email: ADMIN_EMAIL,
    } as never);
    mockGetPromptBySlug.mockResolvedValue(undefined as never);
    mockCreateUserPrompt.mockResolvedValue(CREATED_ROW as never);
  });

  test("admin + mirror success → body carries githubMirror.ok=true, no Warning header", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({ success: true } as never);

    const res = await POST(postReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubMirror).toEqual({ ok: true });
    expect(res.headers.get("Warning")).toBeNull();
    // Mirror is called with the created DB row, not the request body
    expect(mockCommitToGitHub).toHaveBeenCalledWith(CREATED_ROW);
  });

  test("admin + mirror FAILURE → body carries githubMirror.ok=false + Warning header set", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: "GITHUB_TOKEN not set",
    } as never);

    const res = await POST(postReq());
    expect(res.status).toBe(201);
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

  test("non-admin path → no mirror attempt, no githubMirror in body", async () => {
    mockIsAdmin.mockReturnValue(false);

    const res = await POST(postReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubMirror).toBeUndefined();
    expect(mockCommitToGitHub).not.toHaveBeenCalled();
    expect(res.headers.get("Warning")).toBeNull();
  });

  test("admin + mirror THROWS → caught, 201 + githubMirror.ok=false (DB write preserved)", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(postReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubMirror).toEqual({
      ok: false,
      error: "ECONNREFUSED",
    });
    expect(res.headers.get("Warning")).toContain("ECONNREFUSED");
  });

  test("admin + mirror error contains CR/LF/control chars → header sanitized, response NOT 500", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: 'GitHub API: 422\n{"message":"Bad","status":"422"}\r\nrate-limit',
    } as never);

    // The Response construction itself must not throw; the raw error survives
    // in the body, but the header has CR/LF stripped (RFC 7230 §3.2.6).
    const res = await POST(postReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubMirror.ok).toBe(false);
    expect(body.githubMirror.error).toContain("\n"); // body preserves raw
    const warning = res.headers.get("Warning");
    expect(warning).toBeTruthy();
    expect(warning).not.toMatch(/[\r\n\x00-\x1f\x7f]/); // header sanitized
    expect(warning).toContain("GitHub mirror failed");
  });

  test("admin + mirror error contains non-ASCII (emoji/€) → header ASCII-safe, response NOT 500", async () => {
    mockIsAdmin.mockReturnValue(true);
    mockCommitToGitHub.mockResolvedValue({
      success: false,
      error: "GitHub API: 500 — payment € required 🧪",
    } as never);

    // Web `Headers` rejects code points outside 0x20-0x7E with a TypeError.
    // The header must stay ASCII-printable even when upstream errors are not.
    const res = await POST(postReq());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubMirror.error).toContain("🧪"); // body preserves raw
    const warning = res.headers.get("Warning");
    expect(warning).toBeTruthy();
    // eslint-disable-next-line no-control-regex
    expect(warning).toMatch(/^[\x20-\x7e]+$/); // strictly ASCII-printable
    expect(warning).not.toContain("🧪");
  });
});
