"use client";

import {
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { POLL } from "@/lib/console/constants";
import { MetricTile } from "@/components/console/metric-tile";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Period = "day" | "week" | "month";

interface ModelUsage {
  modelId: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

interface UsageData {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: ModelUsage[];
  periodStart: string;
  periodEnd: string;
}

interface TierData {
  plan: string;
  credits: {
    remaining: number;
    monthly: number;
  };
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function periodLabel(period: Period): string {
  switch (period) {
    case "day":
      return "Today";
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
  }
}

export default function UsagePage() {
  const [period, setPeriod] = useState<Period>("month");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [tier, setTier] = useState<TierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const [usageRes, tierRes] = await Promise.all([
        fetch(`/api/usage?period=${period}`, { cache: "no-store" }),
        fetch("/api/tier", { cache: "no-store" }),
      ]);

      if (!usageRes.ok) {
        setError("Could not load usage data");
        setLoading(false);
        return;
      }

      const usageData: UsageData = await usageRes.json();
      setUsage(usageData);

      if (tierRes.ok) {
        const tierData: TierData = await tierRes.json();
        setTier(tierData);
      }

      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchUsage();
    const id = setInterval(fetchUsage, POLL.USAGE);
    return () => clearInterval(id);
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass-card text-center text-text-secondary">
          {error}
        </div>
      </div>
    );
  }

  const totalTokens =
    (usage?.totalInputTokens ?? 0) + (usage?.totalOutputTokens ?? 0);

  const creditsPercent =
    tier && tier.credits.monthly > 0
      ? Math.round((tier.credits.remaining / tier.credits.monthly) * 100)
      : null;

  const creditsStatus: "healthy" | "degraded" | "down" =
    creditsPercent === null
      ? "healthy"
      : creditsPercent > 50
        ? "healthy"
        : creditsPercent > 20
          ? "degraded"
          : "down";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Usage</h1>
          <p className="mt-1 text-sm text-text-secondary">
            API usage and token consumption &mdash; {periodLabel(period)}.
          </p>
        </div>
        <button type="button" onClick={fetchUsage} className="glass-button">
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Period selector */}
      <Tabs
        value={period}
        onValueChange={(v) => setPeriod(v as Period)}
      >
        <TabsList>
          <TabsTrigger value="day">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Total Cost"
          value={usage ? formatDollars(usage.totalCostCents) : "--"}
          status="healthy"
        />
        <MetricTile
          label="Total Tokens"
          value={usage ? formatNumber(totalTokens) : "--"}
          sublabel={
            usage
              ? `${formatNumber(usage.totalInputTokens)} in / ${formatNumber(usage.totalOutputTokens)} out`
              : undefined
          }
          status="healthy"
        />
        <MetricTile
          label="Credits Remaining"
          value={
            tier
              ? `${formatNumber(tier.credits.remaining)} / ${formatNumber(tier.credits.monthly)}`
              : "--"
          }
          sublabel={creditsPercent !== null ? `${creditsPercent}% remaining` : undefined}
          status={creditsStatus}
        />
        <MetricTile
          label="Plan"
          value={tier?.plan ? tier.plan.charAt(0).toUpperCase() + tier.plan.slice(1) : "--"}
          status="healthy"
        />
      </div>

      {/* Per-model breakdown */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <BarChart3 className="size-4" />
          Model Breakdown
        </h2>

        {usage && usage.byModel.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input Tokens</TableHead>
                  <TableHead className="text-right">Output Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.byModel
                  .sort((a, b) => b.costCents - a.costCents)
                  .map((row) => (
                    <TableRow key={row.modelId ?? "unknown"}>
                      <TableCell>
                        <Badge variant="secondary">
                          {row.modelId ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(row.inputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(row.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatDollars(row.costCents)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-sm text-text-secondary">
            No usage data for this period.
          </p>
        )}
      </section>

      {/* Period info footer */}
      {usage && (
        <p className="text-xs text-text-muted">
          Data from{" "}
          {new Date(usage.periodStart).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          to{" "}
          {new Date(usage.periodEnd).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          . Refreshes every 30 seconds.
        </p>
      )}
    </div>
  );
}
