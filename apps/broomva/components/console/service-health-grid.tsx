"use client";

import { useCallback, useEffect, useState } from "react";

import { POLL, SERVICES } from "@/lib/console/constants";
import type { ConsoleHealth } from "@/lib/console/types";
import { MetricTile } from "./metric-tile";

export function ServiceHealthGrid() {
  const [health, setHealth] = useState<ConsoleHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/console/health", { cache: "no-store" });
      if (!res.ok) {
        setError(`Health check failed (${res.status})`);
        return;
      }
      const data: ConsoleHealth = await res.json();
      setHealth(data);
      setError(null);
    } catch {
      setError("Failed to reach health endpoint");
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL.HEALTH);
    return () => clearInterval(id);
  }, [fetchHealth]);

  if (error && !health) {
    return (
      <div className="glass-card p-6 text-center text-text-secondary">
        <p>{error}</p>
        <p className="mt-1 text-xs text-text-muted">Retrying every {POLL.HEALTH / 1000}s...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SERVICES.map((svc) => {
        const svcHealth = health?.[svc.key];
        return (
          <MetricTile
            key={svc.key}
            label={svc.name}
            value={
              svcHealth
                ? svcHealth.status === "unconfigured"
                  ? "N/A"
                  : `${svcHealth.latency_ms}ms`
                : "..."
            }
            status={svcHealth?.status ?? "unconfigured"}
            sublabel={svc.description}
          />
        );
      })}
    </div>
  );
}
