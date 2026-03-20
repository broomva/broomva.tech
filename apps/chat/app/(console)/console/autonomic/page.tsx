"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { POLL } from "@/lib/console/constants";
import type { AutonomicState } from "@/lib/console/types";
import { MetricTile } from "@/components/console/metric-tile";

const TREND_ICON = {
  improving: ArrowUpRight,
  stable: ArrowRight,
  declining: ArrowDownRight,
} as const;

const TREND_COLOR = {
  improving: "text-success",
  stable: "text-ai-blue",
  declining: "text-error",
} as const;

export default function AutonomicPage() {
  const [state, setState] = useState<AutonomicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      // Use health endpoint to determine service availability, then
      // derive mock data. A real implementation would call /api/console/autonomic.
      const res = await fetch("/api/console/health", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not reach autonomic service");
        setLoading(false);
        return;
      }

      const healthData = await res.json();
      const isUp = healthData.autonomic?.status === "healthy";

      const mock: AutonomicState = {
        gating: {
          active_gates: isUp ? 12 : 0,
          passed: isUp ? 847 : 0,
          blocked: isUp ? 23 : 0,
        },
        projections: {
          horizon: "7d",
          confidence: isUp ? 0.87 : 0,
          trend: isUp ? "improving" : "stable",
        },
      };

      setState(mock);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL.HEALTH);
    return () => clearInterval(id);
  }, [fetchState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass-card text-center text-text-secondary">{error}</div>
      </div>
    );
  }

  const TrendIcon = state
    ? TREND_ICON[state.projections.trend]
    : ArrowRight;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Autonomic</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Self-regulation gating and projection state.
        </p>
      </div>

      {/* Gating Section */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <Shield className="size-4" />
          Gating
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Active Gates"
            value={String(state?.gating.active_gates ?? 0)}
            status={
              state && state.gating.active_gates > 0 ? "healthy" : "unconfigured"
            }
          />
          <MetricTile
            label="Passed"
            value={String(state?.gating.passed ?? 0)}
            status="healthy"
          />
          <MetricTile
            label="Blocked"
            value={String(state?.gating.blocked ?? 0)}
            status={
              state && state.gating.blocked > 50 ? "degraded" : "healthy"
            }
          />
        </div>
      </section>

      {/* Projections Section */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
          Projections
        </h2>
        <div className="glass-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs text-text-muted">Horizon</span>
            <div className="text-xl font-semibold text-text-primary">
              {state?.projections.horizon ?? "--"}
            </div>
          </div>
          <div>
            <span className="text-xs text-text-muted">Confidence</span>
            <div className="text-xl font-semibold text-text-primary">
              {state
                ? `${(state.projections.confidence * 100).toFixed(0)}%`
                : "--"}
            </div>
          </div>
          <div>
            <span className="text-xs text-text-muted">Trend</span>
            <div className="flex items-center gap-1">
              <TrendIcon
                className={`size-5 ${
                  state ? TREND_COLOR[state.projections.trend] : "text-text-muted"
                }`}
              />
              <span className="text-sm capitalize text-text-primary">
                {state?.projections.trend ?? "--"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
