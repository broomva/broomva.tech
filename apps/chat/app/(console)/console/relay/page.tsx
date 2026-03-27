"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { POLL } from "@/lib/console/constants";
import type {
  RelayMetrics,
  RelayNodeView,
  RelaySessionView,
} from "@/lib/console/types";

export default function RelayPage() {
  const [nodes, setNodes] = useState<RelayNodeView[]>([]);
  const [sessions, setSessions] = useState<RelaySessionView[]>([]);
  const [metrics, setMetrics] = useState<RelayMetrics>({
    nodesOnline: 0,
    nodesTotal: 0,
    sessionsActive: 0,
    sessionsTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [nodesRes, sessionsRes] = await Promise.all([
        fetch("/api/relay/nodes", { cache: "no-store" }),
        fetch("/api/relay/sessions", { cache: "no-store" }),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        setNodes(data.nodes ?? []);
        setMetrics(
          data.metrics ?? {
            nodesOnline: 0,
            nodesTotal: 0,
            sessionsActive: 0,
            sessionsTotal: 0,
          },
        );
      }

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions ?? []);
      }

      setError(null);
    } catch {
      setError("Failed to fetch relay data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL.RELAY);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground text-sm">Loading relay...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relay</h1>
        <p className="text-muted-foreground text-sm">
          Remote agent sessions from your machines
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Nodes Online" value={metrics.nodesOnline} />
        <MetricCard label="Total Nodes" value={metrics.nodesTotal} />
        <MetricCard label="Active Sessions" value={metrics.sessionsActive} />
        <MetricCard label="Total Sessions" value={metrics.sessionsTotal} />
      </div>

      {/* Nodes */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Relay Nodes</h2>
        {nodes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No relay nodes registered yet.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Install <code className="rounded bg-muted px-1.5 py-0.5">relayd</code> on your machine and run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">relayd auth</code> to connect.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}
          </div>
        )}
      </section>

      {/* Sessions */}
      {sessions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Active Sessions</h2>
          <div className="space-y-2">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function NodeCard({ node }: { node: RelayNodeView }) {
  const statusColor =
    node.status === "online"
      ? "bg-green-500"
      : node.status === "degraded"
        ? "bg-yellow-500"
        : "bg-zinc-400";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${statusColor}`} />
        <span className="font-medium">{node.name}</span>
      </div>
      {node.hostname && (
        <div className="text-muted-foreground mt-1 text-xs font-mono">
          {node.hostname}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {(node.capabilities ?? []).map((cap) => (
          <span
            key={cap}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: RelaySessionView }) {
  const statusColor =
    session.status === "active"
      ? "text-green-500"
      : session.status === "idle"
        ? "text-yellow-500"
        : session.status === "failed"
          ? "text-red-500"
          : "text-zinc-400";

  return (
    <Link
      href={`/console/relay/session/${session.id}` as Route}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent"
    >
      <span className={`text-xs font-medium uppercase ${statusColor}`}>
        {session.status}
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
        {session.sessionType}
      </span>
      <span className="font-medium">{session.name ?? "Untitled"}</span>
      {session.workdir && (
        <span className="text-muted-foreground text-xs font-mono truncate">
          {session.workdir}
        </span>
      )}
      {session.model && (
        <span className="text-muted-foreground ml-auto text-xs">
          {session.model}
        </span>
      )}
    </Link>
  );
}
