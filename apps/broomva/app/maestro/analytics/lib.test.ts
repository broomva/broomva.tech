import { describe, expect, test } from "vitest";
import {
  buildThroughputChart,
  type DailyBucket,
  niceMax,
  shortDate,
  statusSegments,
} from "./lib";

describe("niceMax", () => {
  test("rounds up to nice axis bounds", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(23)).toBe(25);
  });
});

describe("shortDate", () => {
  test("strips leading zeros", () => {
    expect(shortDate("2026-06-05")).toBe("6/5");
    expect(shortDate("2026-12-31")).toBe("12/31");
  });
});

describe("buildThroughputChart", () => {
  const daily: DailyBucket[] = [
    { date: "2026-06-03", pushed: 0, completed: 0 },
    { date: "2026-06-04", pushed: 4, completed: 2 },
    { date: "2026-06-05", pushed: 2, completed: 3 },
  ];

  test("computes a nice yMax from the series peak", () => {
    expect(buildThroughputChart(daily).yMax).toBe(5);
  });

  test("emits two series with non-empty line + area paths", () => {
    const chart = buildThroughputChart(daily);
    expect(chart.series.map((s) => s.key)).toEqual(["pushed", "completed"]);
    for (const s of chart.series) {
      expect(s.line.startsWith("M")).toBe(true);
      expect(s.area.endsWith("Z")).toBe(true);
    }
  });

  test("handles an all-zero series without NaN", () => {
    const flat = buildThroughputChart([
      { date: "2026-06-05", pushed: 0, completed: 0 },
    ]);
    expect(flat.yMax).toBe(1);
    expect(flat.series[0]?.line).not.toContain("NaN");
  });
});

describe("statusSegments", () => {
  test("computes proportional widths and drops zero counts", () => {
    const segs = statusSegments([
      { status: "queued", label: "Queued", count: 3 },
      { status: "done", label: "Done", count: 1 },
      { status: "archived", label: "Archived", count: 0 },
    ]);
    expect(segs.map((s) => s.status)).toEqual(["queued", "done"]);
    expect(segs[0]?.pct).toBe(75);
    expect(segs[1]?.pct).toBe(25);
  });

  test("returns empty when total is zero", () => {
    expect(
      statusSegments([{ status: "queued", label: "Queued", count: 0 }]),
    ).toEqual([]);
  });
});
