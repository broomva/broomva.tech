import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  getVolumeTimeseries: vi.fn(),
}));

import { GET } from "./route";
import { getVolumeTimeseries } from "@/lib/db/queries";

const mockVolume = vi.mocked(getVolumeTimeseries);

function makeReq(qs: string) {
  return new Request(`http://localhost/api/metrics/volume${qs ? `?${qs}` : ""}`);
}

describe("GET /api/metrics/volume", () => {
  beforeEach(() => {
    mockVolume.mockReset();
    mockVolume.mockResolvedValue([
      {
        ts: "2026-05-11T00:00:00.000Z",
        count: 3,
        by_source: { web: 2, cli: 1, skill: 0, api: 0 },
      },
    ]);
  });

  test("200 — default bucket=hour, since=24h", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(mockVolume).toHaveBeenCalledWith({ bucket: "hour", since: "24h" });
  });

  test("200 — bucket=day, since=7d", async () => {
    const res = await GET(makeReq("bucket=day&since=7d"));
    expect(res.status).toBe(200);
    expect(mockVolume).toHaveBeenCalledWith({ bucket: "day", since: "7d" });
  });

  test("400 — invalid bucket value", async () => {
    const res = await GET(makeReq("bucket=year"));
    expect(res.status).toBe(400);
    expect(mockVolume).not.toHaveBeenCalled();
  });

  test("400 — since=all is rejected for volume timeseries", async () => {
    const res = await GET(makeReq("since=all"));
    expect(res.status).toBe(400);
    expect(mockVolume).not.toHaveBeenCalled();
  });
});
