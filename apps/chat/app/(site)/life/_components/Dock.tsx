"use client";

import { useEffect, useState } from "react";
import type { LifeHealth, LifeServiceStatus } from "@/lib/life-runtime/health";
import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
}

/**
 * Poll `/api/life/health` every `HEALTH_POLL_MS` ms so the Dock reflects
 * current service state. Short enough to feel live, long enough to stay
 * off Vercel's billing radar.
 */
const HEALTH_POLL_MS = 60_000;

/**
 * Map an abstract service status to a CSS modifier class. Keep aligned
 * with `.dock__dot--*` rules in `life-styles.css`.
 */
function dotClass(status: LifeServiceStatus): string {
  switch (status) {
    case "live":
      return "dock__dot";
    case "simulated":
      return "dock__dot dock__dot--sim";
    case "degraded":
      return "dock__dot dock__dot--warn";
    case "down":
      return "dock__dot dock__dot--down";
    case "not-deployed":
      return "dock__dot dock__dot--idle";
    default:
      return "dock__dot dock__dot--idle";
  }
}

/**
 * Short status tag suffix next to each pill (e.g. "live", "sim",
 * "coming"). Empty string when the status is just `live` — green dot
 * alone is enough.
 */
function statusTag(status: LifeServiceStatus): string {
  switch (status) {
    case "live":
      return "";
    case "simulated":
      return "sim";
    case "degraded":
      return "warn";
    case "down":
      return "down";
    case "not-deployed":
      return "coming";
    default:
      return "";
  }
}

export function Dock({ state }: Props) {
  const events = state.journal.length;
  const tools = state.journal.filter(
    (e) => e.kind === "tool" && e.label === "TOOL",
  ).length;
  const [health, setHealth] = useState<LifeHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch("/api/life/health", { cache: "no-store" });
        if (!res.ok) return;
        const data: LifeHealth = await res.json();
        if (!cancelled) setHealth(data);
      } catch {
        // Silent — Dock degrades gracefully to loading state if health
        // is unreachable. Not worth alarming the user over.
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Pre-health state: show neutral pills so the dock isn't empty on
  // first paint. These match the default service roster from the
  // health contract.
  const services = health?.services ?? [
    { id: "prosopon", label: "Prosopon", status: "live" as const },
    { id: "ai-gateway", label: "AI Gateway", status: "live" as const },
    { id: "arcan", label: "Arcan", status: "simulated" as const },
    { id: "lago", label: "Lago", status: "simulated" as const },
    { id: "haima", label: "Haima", status: "live" as const },
    { id: "nous", label: "Nous", status: "simulated" as const },
    { id: "lifed", label: "lifed", status: "not-deployed" as const },
  ];

  const version =
    health?.commit ?? (process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) || "dev");

  return (
    <div className="dock">
      <div className="dock__group">
        {services.map((s) => {
          const tag = statusTag(s.status);
          return (
            <span
              key={s.id}
              className="dock__item"
              title={s.detail ?? `${s.label}: ${s.status}`}
            >
              <span className={dotClass(s.status)} />
              <strong>{s.label}</strong>
              {tag && <span className="dock__tag">{tag}</span>}
            </span>
          );
        })}
      </div>
      <div className="dock__group">
        <span className="dock__item">
          events <strong>{events}</strong>
        </span>
        <span className="dock__item">
          tool calls <strong>{tools}</strong>
        </span>
        <span className="dock__item" title="deploy commit">
          {version}
        </span>
      </div>
    </div>
  );
}
