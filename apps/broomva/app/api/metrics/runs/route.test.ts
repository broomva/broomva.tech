import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getRecentInvocations: vi.fn(),
}));

import { GET } from "./route";
import { getRecentInvocations } from "@/lib/db/queries";

const mockGetRuns = vi.mocked(getRecentInvocations);

function makeReq(qs: string) {
  return new Request(`http://localhost/api/metrics/runs${qs ? `?${qs}` : ""}`);
}

const FROZEN = new Date("2026-05-11T00:00:00Z");

describe("GET /api/metrics/runs", () => {
  beforeEach(() => {
    mockGetRuns.mockReset();
    mockGetRuns.mockResolvedValue([
      {
        id: "row-1",
        promptSlug: "code-review-agent",
        promptVersion: "1.0",
        source: "web",
        caller: null,
        userId: null,
        agentId: null,
        sessionId: null,
        clientIpHash: null,
        variables: null,
        status: "pulled",
        model: null,
        latencyMs: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        errorMessage: null,
        externalTraceId: null,
        externalSpanId: null,
        metadata: null,
        createdAt: FROZEN,
        completedAt: null,
      },
    ] as never);
  });

  test("200 — default limit=50, no filters", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(mockGetRuns).toHaveBeenCalledOnce();
    const args = mockGetRuns.mock.calls[0][0];
    expect(args.limit).toBe(50);
    expect(args.promptSlug).toBeUndefined();
    expect(args.source).toBeUndefined();
  });

  test("200 — filters prompt_slug + source", async () => {
    const res = await GET(makeReq("prompt_slug=code-review-agent&source=web"));
    expect(res.status).toBe(200);
    const args = mockGetRuns.mock.calls[0][0];
    expect(args.promptSlug).toBe("code-review-agent");
    expect(args.source).toBe("web");
  });

  test("200 — cursor pagination via ?before", async () => {
    const res = await GET(makeReq("before=2026-05-10T00:00:00.000Z"));
    expect(res.status).toBe(200);
    const args = mockGetRuns.mock.calls[0][0];
    expect(args.before).toBeInstanceOf(Date);
    expect(args.before?.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });

  test("400 — invalid source enum value", async () => {
    const res = await GET(makeReq("source=bogus"));
    expect(res.status).toBe(400);
    expect(mockGetRuns).not.toHaveBeenCalled();
  });
});
