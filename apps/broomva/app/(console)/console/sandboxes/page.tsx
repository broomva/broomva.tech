"use client";

/**
 * /console/sandboxes — Sandbox execution environment management
 *
 * Dependency chain:
 *   broomva.tech (this page)
 *     → /api/sandbox          (GET list, metrics)
 *     → /api/sandbox/:id      (DELETE destroy)
 *     → /api/sandbox/:id/snapshot (POST manual snapshot)
 *   → arcand (ARCAN_URL) → SandboxService (BRO-253) → arcan-provider-vercel (BRO-263)
 *   → Neon DB SandboxInstance table (BRO-261)
 *
 * BRO-261
 */

import {
  BoxIcon,
  Camera,
  CircleX,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { MetricTile } from "@/components/console/metric-tile";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { POLL } from "@/lib/console/constants";
import type {
  SandboxInstanceView,
  SandboxMetrics,
  SandboxProvider,
  SandboxStatus,
} from "@/lib/console/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  SandboxStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  starting: "secondary",
  snapshotted: "outline",
  stopped: "secondary",
  failed: "destructive",
};

const STATUS_DOT: Record<SandboxStatus, string> = {
  running: "bg-green-500",
  starting: "bg-yellow-400",
  snapshotted: "bg-blue-400",
  stopped: "bg-zinc-400",
  failed: "bg-red-500",
};

function StatusBadge({ status }: { status: SandboxStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="gap-1.5 capitalize">
      <span className={`inline-block size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </Badge>
  );
}

// ── Provider badge ────────────────────────────────────────────────────────────

const PROVIDER_COLOR: Record<SandboxProvider, string> = {
  vercel: "bg-black text-white dark:bg-white dark:text-black",
  e2b: "bg-violet-600 text-white",
  local: "bg-zinc-700 text-white",
};

function ProviderBadge({ provider }: { provider: SandboxProvider }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROVIDER_COLOR[provider]}`}
    >
      {provider}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-text-secondary gap-3">
      <BoxIcon className="size-10 opacity-30" />
      <p className="text-sm font-medium">No active sandboxes</p>
      <p className="text-xs text-text-muted max-w-xs">
        Sandboxes are created automatically when an agent executes shell or
        filesystem commands. They appear here once running.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SandboxesPage() {
  const sandboxEnabled = useFeatureFlag("sandbox");
  const [sandboxes, setSandboxes] = useState<SandboxInstanceView[]>([]);
  const [metrics, setMetrics] = useState<SandboxMetrics>({
    active: 0,
    snapshotted: 0,
    execs24h: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSandboxes = useCallback(async () => {
    try {
      const res = await fetch("/api/sandbox", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load sandboxes");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSandboxes(data.sandboxes ?? []);
      setMetrics(data.metrics ?? { active: 0, snapshotted: 0, execs24h: 0 });
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxes();
    const interval = setInterval(fetchSandboxes, POLL.SANDBOXES);
    return () => clearInterval(interval);
  }, [fetchSandboxes]);

  const handleDestroy = useCallback(
    async (sandboxId: string) => {
      setActionLoading(sandboxId);
      try {
        const res = await fetch(`/api/sandbox/${sandboxId}`, {
          method: "DELETE",
        });
        if (res.ok || res.status === 204) {
          setSandboxes((prev) =>
            prev.map((s) =>
              s.id === sandboxId ? { ...s, status: "stopped" as SandboxStatus } : s,
            ),
          );
          setMetrics((prev) => ({ ...prev, active: Math.max(0, prev.active - 1) }));
        }
      } catch {
        // Non-fatal — UI will refresh on next poll
      } finally {
        setActionLoading(null);
      }
    },
    [],
  );

  const handleSnapshot = useCallback(async (sandboxId: string) => {
    setActionLoading(sandboxId);
    try {
      const res = await fetch(`/api/sandbox/${sandboxId}/snapshot`, {
        method: "POST",
      });
      if (res.ok) {
        setSandboxes((prev) =>
          prev.map((s) =>
            s.id === sandboxId
              ? { ...s, status: "snapshotted" as SandboxStatus }
              : s,
          ),
        );
        setMetrics((prev) => ({
          ...prev,
          active: Math.max(0, prev.active - 1),
          snapshotted: prev.snapshotted + 1,
        }));
      }
    } catch {
      // Non-fatal
    } finally {
      setActionLoading(null);
    }
  }, []);

  // ── Feature flag gate (BRO-393) ─────────────────────────────────────
  if (!sandboxEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Sandboxes</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Active execution environments managed by Arcan
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-col items-center justify-center py-20 text-center text-text-secondary gap-3">
            <BoxIcon className="size-10 opacity-30" />
            <p className="text-sm font-medium">Sandbox access requires a plan upgrade</p>
            <p className="text-xs text-text-muted max-w-xs">
              Code execution sandboxes are available on Pro plans and above.
              Upgrade to enable agent sandbox environments.
            </p>
            <a
              href="/pricing"
              className="mt-2 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              View Pricing
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Sandboxes</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Active execution environments managed by Arcan
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSandboxes}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricTile
          label="Active"
          value={loading ? "—" : String(metrics.active)}
          status={metrics.active > 0 ? "healthy" : "degraded"}
          sublabel="running sandboxes"
        />
        <MetricTile
          label="Snapshotted"
          value={loading ? "—" : String(metrics.snapshotted)}
          status={metrics.snapshotted > 0 ? "healthy" : "degraded"}
          sublabel="persisted environments"
        />
        <MetricTile
          label="Execs / 24h"
          value={loading ? "—" : String(metrics.execs24h)}
          status="healthy"
          sublabel="commands executed"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : sandboxes.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Sandbox ID</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Resources</TableHead>
                <TableHead>Last Exec</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sandboxes.map((sandbox) => (
                <TableRow key={sandbox.id}>
                  <TableCell className="font-mono text-xs">
                    {sandbox.sandboxId.length > 20
                      ? `${sandbox.sandboxId.slice(0, 8)}…${sandbox.sandboxId.slice(-6)}`
                      : sandbox.sandboxId}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {sandbox.agentId
                      ? sandbox.agentId.slice(0, 8)
                      : <span className="text-text-muted italic">ad-hoc</span>}
                  </TableCell>
                  <TableCell>
                    <ProviderBadge provider={sandbox.provider} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sandbox.status} />
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {sandbox.vcpus != null && sandbox.memoryMb != null
                      ? `${sandbox.vcpus}vCPU · ${sandbox.memoryMb}MB`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-text-secondary">
                    {relativeTime(sandbox.lastExecAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={actionLoading === sandbox.id}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleSnapshot(sandbox.id)}
                          disabled={
                            sandbox.status === "snapshotted" ||
                            sandbox.status === "stopped"
                          }
                        >
                          <Camera className="size-4 mr-2" />
                          Snapshot
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive focus:text-destructive"
                              disabled={sandbox.status === "stopped"}
                            >
                              <CircleX className="size-4 mr-2" />
                              Destroy
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Destroy sandbox?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently destroy{" "}
                                <span className="font-mono">{sandbox.sandboxId}</span>{" "}
                                and all unsaved state. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDestroy(sandbox.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Destroy
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
