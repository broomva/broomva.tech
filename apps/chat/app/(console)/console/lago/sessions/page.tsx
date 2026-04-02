"use client";

import { ArrowUpRight, Clock, Database, Loader2, Plus, RefreshCw } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { LagoSession, SessionTier } from "@/lib/lago/types";
import { classifySessionTier, TIER_COLORS } from "@/lib/lago/types";

const LAGO_BASE =
  process.env.NEXT_PUBLIC_LAGO_URL ?? "https://api.lago.arcan.la";

type FilterTier = "all" | SessionTier;

export default function LagoSessionsPage() {
  const [sessions, setSessions] = useState<LagoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTier>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${LAGO_BASE}/v1/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch {
      /* graceful */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${LAGO_BASE}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        fetchSessions();
      }
    } finally {
      setCreating(false);
    }
  };

  const filtered =
    filter === "all"
      ? sessions
      : sessions.filter((s) => classifySessionTier(s.name) === filter);

  const tierCounts = sessions.reduce(
    (acc, s) => {
      const tier = classifySessionTier(s.name);
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Upgrade banner — shown when free tier limit reached */}
      {sessions.length >= 3 && (
        <a
          href="https://lago-platform.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm transition-colors hover:bg-amber-500/20"
        >
          <span className="text-amber-200">
            You&apos;ve reached the free tier limit. Upgrade to{" "}
            <strong>Lago Platform</strong> for unlimited sessions.
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-amber-400" />
        </a>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Sessions</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} across{" "}
            {Object.keys(tierCounts).length} tiers
          </p>
        </div>
        <button type="button" onClick={fetchSessions} className="glass-button">
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Tier filter tabs */}
      <div className="flex gap-2">
        {(["all", "public", "vault", "agent", "default"] as FilterTier[]).map(
          (tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setFilter(tier)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tier
                  ? "bg-ai-blue/20 text-ai-blue"
                  : "bg-bg-surface text-text-muted hover:text-text-primary"
              }`}
            >
              {tier === "all" ? "All" : tier}
              {tier === "all" ? ` (${sessions.length})` : tierCounts[tier] ? ` (${tierCounts[tier]})` : ""}
            </button>
          )
        )}
      </div>

      {/* Create session */}
      <div className="glass-card flex gap-3">
        <div className="relative flex-1">
          <Database className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New session name (e.g., agent:my-agent, vault:user-1)"
            className="w-full rounded-lg border border-[var(--ag-border-default)] bg-bg-surface py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-ai-blue focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="glass-button-primary glass-button"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Create
        </button>
      </div>

      {/* Session list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card text-center text-text-secondary">
          {filter === "all"
            ? "No sessions yet."
            : `No ${filter} sessions found.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((session) => {
            const tier = classifySessionTier(session.name);
            return (
              <Link
                key={session.session_id}
                href={`/console/lago/sessions/${session.session_id}` as Route}
                className="glass-card flex items-center justify-between hover:border-ai-blue/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Database className="size-4 text-text-muted" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-text-primary">
                        {session.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLORS[tier]}`}
                      >
                        {tier}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
                      <span className="font-mono">
                        {session.session_id.slice(0, 12)}...
                      </span>
                      <span>
                        {session.branches.length} branch
                        {session.branches.length !== 1 ? "es" : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="size-3" />
                  {formatTimestamp(session.created_at)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(micros: number): string {
  if (micros > 1e15) micros = micros / 1000; // microseconds → milliseconds
  if (micros > 1e12) micros = micros / 1000; // adjust if still too large
  try {
    return new Date(micros).toLocaleDateString();
  } catch {
    return "—";
  }
}
