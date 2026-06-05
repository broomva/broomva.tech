import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { getQueueAnalytics } from "@/lib/db/handoff-queries";
import type { HandoffStatus } from "@/lib/db/schema";
import { buildThroughputChart, statusSegments } from "./lib";

export const metadata = {
  title: "Maestro — queue analytics",
  robots: { index: false, follow: false },
};

/** Status → Arcan Glass color var, for the distribution bar + legend. */
const STATUS_COLOR: Record<HandoffStatus, string> = {
  queued: "var(--ag-accent-blue)",
  in_progress: "var(--ag-ai-blue)",
  done: "var(--ag-success)",
  archived: "var(--muted-foreground, #8a8f98)",
  superseded: "var(--ag-error)",
};
const STATUS_LABEL: Record<HandoffStatus, string> = {
  queued: "Queued",
  in_progress: "In progress",
  done: "Done",
  archived: "Archived",
  superseded: "Superseded",
};

/** Minutes → compact human duration ("2h 5m", "45m", "3d 2h"). */
function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 1) return "<1m";
  if (min < 60) return `${Math.round(min)}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    const rem = Math.round(min % 60);
    return rem ? `${hours}h ${rem}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

/**
 * /maestro/analytics — queue analytics (BRO-1415). The /impeccable view over
 * the handoff queue: KPI tiles, a 14-day throughput chart (pushed vs
 * completed), pickup latency, status distribution, and spec-linkage density.
 * Server-rendered crisp inline SVG (no client charting lib). Owner-gated.
 */
export default async function MaestroAnalyticsPage() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?next=/maestro/analytics");
  }

  const a = await getQueueAnalytics(userId);
  const chart = buildThroughputChart(a.daily);
  const segments = statusSegments(
    (Object.keys(a.statusCounts) as HandoffStatus[]).map((status) => ({
      status,
      label: STATUS_LABEL[status],
      count: a.statusCounts[status],
    })),
  );

  const kpis: Array<{ label: string; value: string; tone: string }> = [
    {
      label: "Queued",
      value: String(a.statusCounts.queued),
      tone: "var(--ag-accent-blue)",
    },
    {
      label: "In progress",
      value: String(a.statusCounts.in_progress),
      tone: "var(--ag-ai-blue)",
    },
    {
      label: "Done",
      value: String(a.statusCounts.done),
      tone: "var(--ag-success)",
    },
    {
      label: "Pushed · 7d",
      value: String(a.pushed7d),
      tone: "var(--ag-accent-blue)",
    },
    {
      label: "Completed · 7d",
      value: String(a.completed7d),
      tone: "var(--ag-success)",
    },
    {
      label: "Median pickup",
      value: fmtMinutes(a.medianPickupMinutes),
      tone: "var(--ag-warning)",
    },
    {
      label: "Specs / handoff",
      value: a.avgSpecsPerHandoff.toFixed(1),
      tone: "var(--ag-ai-blue)",
    },
    { label: "Total", value: String(a.total), tone: "var(--foreground)" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-28">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/maestro"
            className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            Maestro
          </Link>
          <span className="text-muted-foreground/50 text-sm">/</span>
          <Link
            href={"/maestro/queue" as Route}
            className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            Queue
          </Link>
          <span className="text-muted-foreground/50 text-sm">/</span>
          <h1 className="font-semibold text-2xl">Analytics</h1>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          Throughput, pickup latency, and spec-linkage density across the
          handoff queue. Last 14 days.
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-border/60 bg-bg-surface/40 px-3.5 py-3"
          >
            <div
              className="font-semibold text-2xl tabular-nums"
              style={{ color: k.tone }}
            >
              {k.value}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground uppercase tracking-wide">
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* Throughput chart */}
      <section className="mt-6 rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-sm">Throughput · 14 days</h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <Legend color="var(--ag-accent-blue)" label="Pushed" />
            <Legend color="var(--ag-success)" label="Completed" />
          </div>
        </div>
        {a.total === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-xs">
            No handoffs yet — push one to see throughput.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Handoffs pushed vs completed over the last 14 days"
          >
            <title>Handoffs pushed vs completed, last 14 days</title>
            <defs>
              <linearGradient id="grad-pushed" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--ag-accent-blue)"
                  stopOpacity="0.28"
                />
                <stop
                  offset="100%"
                  stopColor="var(--ag-accent-blue)"
                  stopOpacity="0"
                />
              </linearGradient>
              <linearGradient id="grad-completed" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--ag-success)"
                  stopOpacity="0.22"
                />
                <stop
                  offset="100%"
                  stopColor="var(--ag-success)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {/* y gridlines + labels */}
            {chart.yTicks.map((t) => (
              <g key={t.value}>
                <line
                  x1={26}
                  x2={chart.width - 10}
                  y1={t.y}
                  y2={t.y}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  className="text-foreground"
                />
                <text
                  x={20}
                  y={t.y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {t.value}
                </text>
              </g>
            ))}

            {/* areas + lines */}
            <path d={chart.series[0]?.area} fill="url(#grad-pushed)" />
            <path d={chart.series[1]?.area} fill="url(#grad-completed)" />
            <path
              d={chart.series[0]?.line}
              fill="none"
              stroke="var(--ag-accent-blue)"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={chart.series[1]?.line}
              fill="none"
              stroke="var(--ag-success)"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* leading dots */}
            <circle
              cx={chart.series[0]?.lastX}
              cy={chart.series[0]?.lastY}
              r={2.6}
              fill="var(--ag-accent-blue)"
            />
            <circle
              cx={chart.series[1]?.lastX}
              cy={chart.series[1]?.lastY}
              r={2.6}
              fill="var(--ag-success)"
            />

            {/* x labels */}
            {chart.xTicks.map((t) => (
              <text
                key={t.label}
                x={t.x}
                y={chart.height - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 9 }}
              >
                {t.label}
              </text>
            ))}
          </svg>
        )}
      </section>

      {/* Status distribution */}
      <section className="mt-6 rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-4">
        <h2 className="mb-3 font-medium text-sm">Status distribution</h2>
        {segments.length === 0 ? (
          <p className="py-3 text-center text-muted-foreground text-xs">
            No handoffs to distribute yet.
          </p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
              {segments.map((s) => (
                <div
                  key={s.status}
                  style={{
                    width: `${s.pct}%`,
                    backgroundColor: STATUS_COLOR[s.status as HandoffStatus],
                  }}
                  title={`${s.label}: ${s.count} (${s.pct}%)`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {segments.map((s) => (
                <div
                  key={s.status}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span
                    className="size-2.5 rounded-sm"
                    style={{
                      backgroundColor: STATUS_COLOR[s.status as HandoffStatus],
                    }}
                  />
                  <span className="text-foreground">{s.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.count} · {s.pct}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
