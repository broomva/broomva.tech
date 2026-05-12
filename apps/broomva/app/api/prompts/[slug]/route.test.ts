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

import { GET } from "./route";
import { getPromptBySlug, getPromptMetrics } from "@/lib/db/queries";
import { getContentBySlug } from "@/lib/content";

const mockGetPrompt = vi.mocked(getPromptBySlug);
const mockGetMetrics = vi.mocked(getPromptMetrics);
const mockGetContent = vi.mocked(getContentBySlug);

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
