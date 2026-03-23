"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import type { AgentRegistration } from "@/lib/db/schema";
import type { Route } from "next";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Trust level badge config
// ---------------------------------------------------------------------------

const TRUST_LEVELS = [
  "unrated",
  "bronze",
  "silver",
  "gold",
  "platinum",
] as const;

type TrustLevel = (typeof TRUST_LEVELS)[number];

const trustBadgeStyles: Record<TrustLevel, string> = {
  unrated:
    "border-border/40 bg-bg-elevated/30 text-text-muted",
  bronze:
    "border-amber-700/40 bg-amber-900/20 text-amber-400",
  silver:
    "border-slate-400/40 bg-slate-700/20 text-slate-300",
  gold:
    "border-yellow-500/40 bg-yellow-900/20 text-yellow-400 shadow-[0_0_8px_oklch(0.80_0.12_85/0.10)]",
  platinum:
    "border-emerald-400/40 bg-emerald-900/20 text-emerald-400 shadow-[0_0_10px_oklch(0.70_0.15_155/0.12)]",
};

const statusBadgeStyles: Record<string, string> = {
  certified:
    "border-emerald-500/40 bg-emerald-900/20 text-emerald-400",
  pending:
    "border-amber-500/40 bg-amber-900/20 text-amber-400",
  evaluating:
    "border-sky-500/40 bg-sky-900/20 text-sky-400",
  failed:
    "border-red-500/40 bg-red-900/20 text-red-400",
  revoked:
    "border-red-700/40 bg-red-950/20 text-red-500",
};

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function TrustScoreBar({ score }: { score: number | null }) {
  const value = score ?? 0;
  const pct = Math.min(Math.max(value, 0), 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ai-blue/60 to-ai-blue transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted">
        {value}
      </span>
    </div>
  );
}

function AgentCard({
  agent,
  index,
}: {
  agent: AgentRegistration;
  index: number;
}) {
  const level = (agent.trustLevel ?? "unrated") as TrustLevel;
  const capabilities = (agent.capabilities ?? []) as string[];
  const descriptionTruncated =
    agent.description && agent.description.length > 140
      ? `${agent.description.slice(0, 140)}...`
      : agent.description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.04,
        duration: 0.35,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <div className="glass-card group flex h-full flex-col overflow-hidden p-0">
        <div className="flex flex-1 flex-col px-5 py-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base text-text-primary">
              {agent.name}
            </h3>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${trustBadgeStyles[level]}`}
            >
              {level}
            </span>
          </div>

          {/* Description */}
          {descriptionTruncated && (
            <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
              {descriptionTruncated}
            </p>
          )}

          {/* Trust score */}
          <div className="mt-4">
            <TrustScoreBar score={agent.trustScore} />
          </div>

          {/* Capabilities */}
          {capabilities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {capabilities.slice(0, 5).map((cap) => (
                <span
                  key={cap}
                  className="rounded-md border border-border/20 bg-bg-elevated/30 px-2 py-0.5 text-[10px] text-text-secondary backdrop-blur-sm"
                >
                  {cap}
                </span>
              ))}
              {capabilities.length > 5 && (
                <span className="rounded-md border border-border/20 bg-bg-elevated/30 px-2 py-0.5 text-[10px] text-text-muted backdrop-blur-sm">
                  +{capabilities.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Footer: status + version */}
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusBadgeStyles[agent.status] ?? statusBadgeStyles.pending}`}
            >
              {agent.status}
            </span>
            {agent.version && (
              <span className="text-[10px] text-text-muted/60">
                v{agent.version}
              </span>
            )}
            <span className="flex-1" />
            {agent.sourceUrl && (
              <Link
                href={agent.sourceUrl as Route}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-border/20 px-2.5 py-1 text-xs text-ai-blue/70 backdrop-blur-sm transition hover:border-ai-blue/30 hover:text-ai-blue"
              >
                Source
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filter pill helper
// ---------------------------------------------------------------------------

function pillClass(active: boolean): string {
  return `rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
    active
      ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
      : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
  }`;
}

// ---------------------------------------------------------------------------
// Main grid
// ---------------------------------------------------------------------------

export function AgentDiscoveryGrid({
  agents,
  capabilities,
}: {
  agents: AgentRegistration[];
  capabilities: string[];
}) {
  const [activeCapability, setActiveCapability] = useState<string | null>(null);
  const [activeTrustLevel, setActiveTrustLevel] = useState<TrustLevel | null>(
    null,
  );

  const filtered = useMemo(() => {
    let result = agents;

    if (activeCapability) {
      result = result.filter((a) =>
        ((a.capabilities ?? []) as string[]).includes(activeCapability),
      );
    }

    if (activeTrustLevel) {
      result = result.filter((a) => a.trustLevel === activeTrustLevel);
    }

    return result;
  }, [agents, activeCapability, activeTrustLevel]);

  return (
    <>
      {/* Capability filter */}
      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCapability(null)}
          className={pillClass(!activeCapability)}
        >
          All capabilities{" "}
          <span className="ml-1 text-[10px] opacity-60">{agents.length}</span>
        </button>
        {capabilities.map((cap) => {
          const count = agents.filter((a) =>
            ((a.capabilities ?? []) as string[]).includes(cap),
          ).length;
          if (count === 0) return null;
          return (
            <button
              key={cap}
              type="button"
              onClick={() =>
                setActiveCapability(activeCapability === cap ? null : cap)
              }
              className={pillClass(activeCapability === cap)}
            >
              {cap}
              <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Trust level filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="flex items-center text-[10px] uppercase tracking-[0.2em] text-text-muted/50">
          Trust
        </span>
        {TRUST_LEVELS.map((level) => {
          const count = agents.filter((a) => a.trustLevel === level).length;
          if (count === 0) return null;
          return (
            <button
              key={level}
              type="button"
              onClick={() =>
                setActiveTrustLevel(activeTrustLevel === level ? null : level)
              }
              className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
                activeTrustLevel === level
                  ? trustBadgeStyles[level]
                  : "border-border/30 bg-bg-elevated/20 text-text-muted hover:border-border/50"
              }`}
            >
              {level}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Count */}
      <p className="mt-6 text-xs text-text-muted/60">
        {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
        {activeCapability ? ` with ${activeCapability}` : ""}
        {activeTrustLevel ? ` at ${activeTrustLevel} level` : ""}
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <motion.div
          key={`${activeCapability ?? "__all__"}-${activeTrustLevel ?? "__all__"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-12 flex flex-col items-center gap-4 text-center"
        >
          <div className="glass-card inline-flex flex-col items-center gap-3 px-8 py-10">
            <span className="text-3xl opacity-40">0</span>
            <p className="text-sm text-text-muted">
              No certified agents yet. Be the first &mdash; register yours at{" "}
              <code className="rounded border border-border/30 bg-bg-elevated/40 px-1.5 py-0.5 text-xs text-ai-blue/70">
                /api/discovery/register
              </code>
            </p>
          </div>
        </motion.div>
      )}
    </>
  );
}
