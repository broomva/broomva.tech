import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getOverviewMetrics: vi.fn(),
}));

import { GET } from "./route";
import { getOverviewMetrics } from "@/lib/db/queries";

const mockGetOverview = vi.mocked(getOverviewMetrics);

function makeReq(qs: string) {
  return new Request(`http://localhost/api/metrics/overview${qs ? `?${qs}` : ""}`);
}

const SAMPLE = {
  since: "7d" as const,
  as_of: "2026-05-11T00:00:00.000Z",
  last_invocation_at: "2026-05-11T00:00:00.000Z",
  totals: {
    prompts: 10,
    copies: 5,
    cli_pulls: 3,
    skill_invokes: 1,
    traces: 9,
    runs_7d: 9,
  },
  deltas_vs_prev: {
    copies: 0,
    cli_pulls: 0,
    skill_invokes: 0,
    traces: 0,
  },
  live_failures_1h: 0,
};

describe("GET /api/metrics/overview", () => {
  beforeEach(() => {
    mockGetOverview.mockReset();
    mockGetOverview.mockResolvedValue(SAMPLE);
  });

  test("200 — default since=7d", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toBeDefined();
    expect(body.totals.prompts).toBe(10);
    expect(mockGetOverview).toHaveBeenCalledWith({ since: "7d" });
  });

  test("200 — explicit since=24h", async () => {
    const res = await GET(makeReq("since=24h"));
    expect(res.status).toBe(200);
    expect(mockGetOverview).toHaveBeenCalledWith({ since: "24h" });
  });

  test("400 — invalid since rejected", async () => {
    const res = await GET(makeReq("since=banana"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_payload");
    expect(mockGetOverview).not.toHaveBeenCalled();
  });
});
