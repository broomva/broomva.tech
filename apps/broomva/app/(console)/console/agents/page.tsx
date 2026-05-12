"use client";

import {
  BotIcon,
  RefreshCw,
  ShieldOff,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AgentData {
  id: string;
  name: string;
  publicKey: string | null;
  capabilities: string[];
  status: string;
  lastActiveAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentUsage {
  totalTokens: number;
  totalCost: number;
  eventCount: number;
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    eventCount: number;
  }>;
}

interface AgentWithUsage extends AgentData {
  usage?: AgentUsage;
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

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load agents");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const agentList: AgentData[] = data.agents ?? [];

      // Fetch usage for each agent in parallel
      const withUsage = await Promise.all(
        agentList.map(async (a) => {
          try {
            const usageRes = await fetch(`/api/agents/${a.id}/usage`, {
              cache: "no-store",
            });
            if (usageRes.ok) {
              const usage: AgentUsage = await usageRes.json();
              return { ...a, usage };
            }
          } catch {
            // Silently skip usage fetch failures
          }
          return { ...a, usage: undefined };
        }),
      );

      setAgents(withUsage);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const revokeAgent = useCallback(
    async (agentId: string) => {
      setRevoking(agentId);
      try {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          await fetchAgents();
        }
      } catch {
        // Ignore
      } finally {
        setRevoking(null);
      }
    },
    [fetchAgents],
  );

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, POLL.USAGE);
    return () => clearInterval(id);
  }, [fetchAgents]);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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

  const activeCount = agents.filter((a) => a.status === "active").length;
  const revokedCount = agents.filter((a) => a.status === "revoked").length;
  const totalCost = agents.reduce(
    (sum, a) => sum + (a.usage?.totalCost ?? 0),
    0,
  );
  const totalTokens = agents.reduce(
    (sum, a) => sum + (a.usage?.totalTokens ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage registered agents and track their usage.
          </p>
        </div>
        <button type="button" onClick={fetchAgents} className="glass-button">
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Total Agents"
          value={String(agents.length)}
          sublabel={`${activeCount} active, ${revokedCount} revoked`}
          status="healthy"
        />
        <MetricTile
          label="Total Cost"
          value={formatDollars(totalCost)}
          sublabel="Across all agents"
          status="healthy"
        />
        <MetricTile
          label="Total Tokens"
          value={formatNumber(totalTokens)}
          sublabel="Across all agents"
          status="healthy"
        />
        <MetricTile
          label="Active"
          value={String(activeCount)}
          status={activeCount > 0 ? "healthy" : "unconfigured"}
        />
      </div>

      {/* Agent list */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <BotIcon className="size-4" />
          Registered Agents
        </h2>

        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === "active" ? "default" : "destructive"
                        }
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(a.usage?.totalTokens ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDollars(a.usage?.totalCost ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(a.usage?.eventCount ?? 0)}
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {relativeTime(a.lastActiveAt)}
                    </TableCell>
                    <TableCell>
                      {a.status === "active" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              className="glass-button text-xs"
                              disabled={revoking === a.id}
                            >
                              <ShieldOff className="size-3" />
                              Revoke
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Revoke agent &ldquo;{a.name}&rdquo;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently disable this agent. It
                                will no longer be able to authenticate or make
                                API calls. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => revokeAgent(a.id)}
                              >
                                Revoke Agent
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-text-secondary">
              No agents registered yet.
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Register an agent via the CLI:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                bstack agent register
              </code>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
