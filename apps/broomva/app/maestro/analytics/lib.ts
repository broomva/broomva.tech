/**
 * Pure chart geometry for /maestro/analytics (BRO-1415). The analytics page is
 * a server component rendering crisp inline SVG (no client charting lib), so
 * the geometry math lives here — pure + unit-tested, decoupled from React.
 */

export interface DailyBucket {
  date: string;
  pushed: number;
  completed: number;
}

export interface ChartSeries {
  key: string;
  /** SVG `d` for the connecting line. */
  line: string;
  /** SVG `d` for the filled area under the line. */
  area: string;
  /** Last point (for the leading marker dot). */
  lastX: number;
  lastY: number;
}

export interface ThroughputChart {
  width: number;
  height: number;
  yMax: number;
  baselineY: number;
  yTicks: Array<{ value: number; y: number }>;
  xTicks: Array<{ label: string; x: number }>;
  series: ChartSeries[];
}

/** Round a max value up to a "nice" axis bound (1/2/2.5/5 × 10ⁿ). */
export function niceMax(value: number): number {
  if (value <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const f of [1, 2, 2.5, 5, 10]) {
    const candidate = f * pow;
    if (value <= candidate) return candidate;
  }
  return 10 * pow;
}

/** "2026-06-05" → "6/5" (no leading zeros), for compact x-axis labels. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${Number(m)}/${Number(d)}`;
}

const WIDTH = 680;
const HEIGHT = 190;
const PAD_L = 26;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;

/**
 * Build the throughput chart geometry: two series (pushed, completed) over the
 * daily buckets. Returns line + area paths plus axis ticks. Coordinates are in
 * a fixed 680×190 viewBox; the SVG scales responsively via width="100%".
 */
export function buildThroughputChart(daily: DailyBucket[]): ThroughputChart {
  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  const baselineY = PAD_T + innerH;
  const n = daily.length;

  const rawMax = daily.reduce((m, d) => Math.max(m, d.pushed, d.completed), 0);
  const yMax = niceMax(rawMax);

  const xAt = (i: number) =>
    n <= 1 ? PAD_L + innerW / 2 : PAD_L + (i / (n - 1)) * innerW;
  const yAt = (v: number) => PAD_T + innerH - (v / yMax) * innerH;

  const buildSeries = (key: "pushed" | "completed"): ChartSeries => {
    const pts = daily.map((d, i) => [xAt(i), yAt(d[key])] as const);
    const line = pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`)
      .join(" ");
    const first = pts[0];
    const last = pts[pts.length - 1];
    const area =
      pts.length > 0 && first && last
        ? `${line} L${round(last[0])} ${round(baselineY)} L${round(first[0])} ${round(baselineY)} Z`
        : "";
    return {
      key,
      line,
      area,
      lastX: last ? round(last[0]) : 0,
      lastY: last ? round(last[1]) : baselineY,
    };
  };

  const yTicks = [0, yMax / 2, yMax].map((value) => ({
    value,
    y: round(yAt(value)),
  }));

  const step = Math.max(1, Math.ceil(n / 5));
  const xTicks: Array<{ label: string; x: number }> = [];
  for (let i = 0; i < n; i += step) {
    const bucket = daily[i];
    if (bucket)
      xTicks.push({ label: shortDate(bucket.date), x: round(xAt(i)) });
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    yMax,
    baselineY: round(baselineY),
    yTicks,
    xTicks,
    series: [buildSeries("pushed"), buildSeries("completed")],
  };
}

/** A horizontal stacked-proportion bar segment for the status distribution. */
export interface StatusBarSegment {
  status: string;
  label: string;
  count: number;
  /** Width as a percentage of the total (0–100). */
  pct: number;
}

/**
 * Proportional segments for the status distribution bar. Zero-count statuses
 * are dropped; pct sums to ~100 when total > 0.
 */
export function statusSegments(
  counts: Array<{ status: string; label: string; count: number }>,
): StatusBarSegment[] {
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (total === 0) return [];
  return counts
    .filter((c) => c.count > 0)
    .map((c) => ({
      status: c.status,
      label: c.label,
      count: c.count,
      pct: Math.round((c.count / total) * 1000) / 10,
    }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
