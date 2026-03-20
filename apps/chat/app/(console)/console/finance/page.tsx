"use client";

import { DollarSign, Loader2, RefreshCw, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { POLL } from "@/lib/console/constants";
import type { FinancialState } from "@/lib/console/types";
import { MetricTile } from "@/components/console/metric-tile";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FinancePage() {
  const [finance, setFinance] = useState<FinancialState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinance = useCallback(async () => {
    try {
      const res = await fetch("/api/console/health", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not reach finance service");
        setLoading(false);
        return;
      }

      const healthData = await res.json();
      const haimaUp = healthData.haima?.status === "healthy";

      // Mock data — real implementation would call /api/console/finance
      const mock: FinancialState = {
        balance: haimaUp ? 42_350 : 0,
        currency: "USD",
        monthly_burn: haimaUp ? 8_200 : 0,
        runway_months: haimaUp ? 5.2 : 0,
        last_updated: healthData.timestamp,
      };

      setFinance(mock);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFinance();
    const id = setInterval(fetchFinance, POLL.FINANCE);
    return () => clearInterval(id);
  }, [fetchFinance]);

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

  const runwayStatus: "healthy" | "degraded" | "down" =
    finance && finance.runway_months > 6
      ? "healthy"
      : finance && finance.runway_months > 3
        ? "degraded"
        : "down";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Finance</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Financial state from Haima.
          </p>
        </div>
        <button type="button" onClick={fetchFinance} className="glass-button">
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Balance"
          value={
            finance ? formatCurrency(finance.balance, finance.currency) : "--"
          }
          status={finance && finance.balance > 0 ? "healthy" : "unconfigured"}
        />
        <MetricTile
          label="Monthly Burn"
          value={
            finance
              ? formatCurrency(finance.monthly_burn, finance.currency)
              : "--"
          }
          status={
            finance && finance.monthly_burn > 10_000 ? "degraded" : "healthy"
          }
        />
        <MetricTile
          label="Runway"
          value={
            finance ? `${finance.runway_months.toFixed(1)} mo` : "--"
          }
          status={runwayStatus}
        />
        <MetricTile
          label="Last Updated"
          value={
            finance
              ? new Date(finance.last_updated).toLocaleTimeString()
              : "--"
          }
          status="healthy"
        />
      </div>

      {/* Details card */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <DollarSign className="size-4" />
          Financial Summary
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Current Balance</span>
            <span className="font-mono text-text-primary">
              {finance
                ? formatCurrency(finance.balance, finance.currency)
                : "--"}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Monthly Expenditure</span>
            <span className="flex items-center gap-1 font-mono text-text-primary">
              <TrendingDown className="size-3 text-error" />
              {finance
                ? formatCurrency(finance.monthly_burn, finance.currency)
                : "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Projected Runway</span>
            <span className="font-mono text-text-primary">
              {finance ? `${finance.runway_months.toFixed(1)} months` : "--"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
