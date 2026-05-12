import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getPromptMetrics: vi.fn(),
}));

import { GET } from "./route";
import { getPromptMetrics } from "@/lib/db/queries";

const mockMetrics = vi.mocked(getPromptMetrics);

const SAMPLE = {
  totals: {
    copies: 5,
    cli_pulls: 3,
    skill_invokes: 1,
    traces: 9,
  },
  runs_7d: 9,
  delta_pct: 0,
  last_used_at: "2026-05-11T00:00:00.000Z",
  avg_latency_ms: 1200,
  avg_cost_usd: 0.012,
  feedback: {
    thumbs_up: 4,
    thumbs_down: 1,
    rate: 0.8,
  },
  timeseries: {
    pass_rate_7d_by_day: null,
    volume_7d_by_day: [],
  },
};

function makeReq() {
  return new Request("http://localhost/api/metrics/prompts/code-review-agent");
}

describe("GET /api/metrics/prompts/[slug]", () => {
  beforeEach(() => {
    mockMetrics.mockReset();
    mockMetrics.mockResolvedValue(SAMPLE as never);
  });

  test("200 — returns expected per-prompt shape", async () => {
    const res = await GET(makeReq(), {
      params: Promise.resolve({ slug: "code-review-agent" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toBeDefined();
    expect(body.totals.copies).toBe(5);
    expect(body.totals.traces).toBe(9);
    expect(body.feedback.rate).toBe(0.8);
    expect(body.runs_7d).toBe(9);
    expect(mockMetrics).toHaveBeenCalledWith("code-review-agent");
  });
});
