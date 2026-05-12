"use client";

import { Activity, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ParsedMetric } from "@/lib/lago/types";
import { parsePrometheusText } from "@/lib/lago/types";

const LAGO_BASE =
  process.env.NEXT_PUBLIC_LAGO_URL ?? "https://api.lago.arcan.la";

export default function LagoMetricsPage() {
  const [metrics, setMetrics] = useState<ParsedMetric[]>([]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${LAGO_BASE}/metrics`);
      if (res.ok) {
        const text = await res.text();
        setRaw(text);
        setMetrics(parsePrometheusText(text));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 15_000);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  // Group metrics by name
  const grouped = metrics.reduce(
    (acc, m) => {
      if (!acc[m.name]) acc[m.name] = [];
      acc[m.name].push(m);
      return acc;
    },
    {} as Record<string, ParsedMetric[]>
  );

  const totalRequests = metrics
    .filter((m) => m.name === "lago_http_requests_total")
    .reduce((sum, m) => sum + m.value, 0);

  const activeSessions =
    metrics.find((m) => m.name === "lago_active_sessions")?.value ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold flex items-center gap-2">
            <Activity className="size-6 text-ai-blue" />
            Metrics
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Prometheus metrics from lagod — auto-refreshes every 15s
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="glass-button text-xs"
          >
            {showRaw ? "Parsed" : "Raw"}
          </button>
          <button
            type="button"
            onClick={fetchMetrics}
            className="glass-button"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {/* Upgrade note */}
      <a
        href="https://lago-platform.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-lg border border-ai-blue/30 bg-ai-blue/10 px-4 py-3 text-sm transition-colors hover:bg-ai-blue/20"
      >
        <span className="text-blue-200">
          Full time-series charts and alerting available on{" "}
          <strong>Lago Platform</strong>
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-ai-blue" />
      </a>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-card">
          <div className="text-xs text-text-muted uppercase tracking-wider">
            Total Requests
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">
            {totalRequests.toLocaleString()}
          </div>
        </div>
        <div className="glass-card">
          <div className="text-xs text-text-muted uppercase tracking-wider">
            Active Sessions
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">
            {activeSessions}
          </div>
        </div>
        <div className="glass-card">
          <div className="text-xs text-text-muted uppercase tracking-wider">
            Metric Families
          </div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">
            {Object.keys(grouped).length}
          </div>
        </div>
      </div>

      {showRaw ? (
        <div className="glass-card">
          <pre className="overflow-x-auto text-xs font-mono text-text-primary leading-relaxed max-h-[600px] overflow-y-auto">
            {raw}
          </pre>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([name, entries]) => (
            <div key={name} className="glass-card">
              <h3 className="font-mono text-sm font-semibold text-text-primary mb-2">
                {name}
              </h3>
              <div className="space-y-1">
                {entries.map((m, i) => {
                  const labelStr = Object.entries(m.labels)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(", ");
                  return (
                    <div
                      key={`${name}-${i}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-text-muted truncate max-w-[70%]">
                        {labelStr || "(no labels)"}
                      </span>
                      <span className="font-mono text-text-primary font-medium">
                        {formatMetricValue(m.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatMetricValue(value: number): string {
  if (value === 0) return "0";
  if (value < 0.001) return value.toExponential(2);
  if (value < 1) return value.toFixed(4);
  if (value < 1000) return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
