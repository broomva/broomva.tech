"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircuitBoard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Server,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SERVICES } from "@/lib/console/constants";
import { MetricTile } from "@/components/console/metric-tile";
import type { ServiceStatus as MetricStatus } from "@/lib/console/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface LifeInstance {
  id: string;
  organizationId: string;
  railwayProjectId: string | null;
  railwayEnvironmentId: string | null;
  status:
    | "provisioning"
    | "running"
    | "stopped"
    | "degraded"
    | "failed"
    | "deprovisioning";
  arcanUrl: string | null;
  lagoUrl: string | null;
  autonomicUrl: string | null;
  haimaUrl: string | null;
  lastHealthCheck: string | null;
  lastHealthStatus: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface RailwayServiceStatus {
  serviceId: string;
  serviceName: string;
  status: string;
}

interface LifeInstanceResponse {
  instance: LifeInstance;
  railwayStatus: {
    projectId: string;
    projectName: string;
    services: RailwayServiceStatus[];
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVISION_POLL_MS = 5_000;

type InstanceStatus = LifeInstance["status"];

const STATUS_CONFIG: Record<
  InstanceStatus,
  { label: string; color: string; icon: typeof CheckCircle2; metric: MetricStatus }
> = {
  provisioning: {
    label: "Provisioning",
    color: "text-yellow-400",
    icon: Loader2,
    metric: "degraded",
  },
  running: {
    label: "Running",
    color: "text-green-400",
    icon: CheckCircle2,
    metric: "healthy",
  },
  stopped: {
    label: "Stopped",
    color: "text-text-muted",
    icon: XCircle,
    metric: "unconfigured",
  },
  degraded: {
    label: "Degraded",
    color: "text-yellow-400",
    icon: AlertTriangle,
    metric: "degraded",
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    icon: XCircle,
    metric: "down",
  },
  deprovisioning: {
    label: "Deprovisioning",
    color: "text-yellow-400",
    icon: Loader2,
    metric: "degraded",
  },
};

function serviceUrlKey(
  key: string,
): keyof Pick<LifeInstance, "arcanUrl" | "lagoUrl" | "autonomicUrl" | "haimaUrl"> {
  const map: Record<string, keyof Pick<LifeInstance, "arcanUrl" | "lagoUrl" | "autonomicUrl" | "haimaUrl">> = {
    arcan: "arcanUrl",
    lago: "lagoUrl",
    autonomic: "autonomicUrl",
    haima: "haimaUrl",
  };
  return map[key] ?? "arcanUrl";
}

function railwayStatusToMetric(status: string): MetricStatus {
  const lower = status.toLowerCase();
  if (lower === "success" || lower === "running" || lower === "healthy")
    return "healthy";
  if (
    lower === "deploying" ||
    lower === "building" ||
    lower === "initializing" ||
    lower === "waiting"
  )
    return "degraded";
  if (lower === "unknown" || lower === "removed" || lower === "sleeping")
    return "unconfigured";
  return "down";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeploymentsPage() {
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [instance, setInstance] = useState<LifeInstance | null>(null);
  const [railwayServices, setRailwayServices] = useState<
    RailwayServiceStatus[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmDeprovision, setConfirmDeprovision] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch organization ──────────────────────────────────────────────

  const fetchOrg = useCallback(async (): Promise<OrgSummary | null> => {
    try {
      const res = await fetch("/api/organization", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const orgs: OrgSummary[] = data.organizations ?? [];
      return orgs[0] ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Fetch Life instance ─────────────────────────────────────────────

  const fetchInstance = useCallback(
    async (orgId: string) => {
      try {
        const res = await fetch(
          `/api/platform/life?organizationId=${orgId}`,
          { cache: "no-store" },
        );
        if (res.status === 404) {
          setInstance(null);
          setRailwayServices(null);
          return null;
        }
        if (!res.ok) {
          setError("Could not load deployment status");
          return null;
        }
        const data: LifeInstanceResponse = await res.json();
        setInstance(data.instance);
        setRailwayServices(data.railwayStatus?.services ?? null);
        setError(null);
        return data.instance;
      } catch {
        setError("Network error");
        return null;
      }
    },
    [],
  );

  // ── Polling for provisioning ────────────────────────────────────────

  const startPolling = useCallback(
    (orgId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const inst = await fetchInstance(orgId);
        if (inst && inst.status !== "provisioning" && inst.status !== "deprovisioning") {
          stopPolling();
        }
      }, PROVISION_POLL_MS);
    },
    [fetchInstance],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const orgData = await fetchOrg();
      if (cancelled) return;

      if (!orgData) {
        setOrg(null);
        setLoading(false);
        return;
      }

      setOrg(orgData);
      const inst = await fetchInstance(orgData.id);
      if (cancelled) return;

      if (inst && (inst.status === "provisioning" || inst.status === "deprovisioning")) {
        startPolling(orgData.id);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [fetchOrg, fetchInstance, startPolling, stopPolling]);

  // ── Provision ───────────────────────────────────────────────────────

  const handleProvision = async () => {
    if (!org) return;
    setActionError(null);
    setActionSuccess(null);
    setActionLoading(true);

    try {
      const res = await fetch("/api/platform/life", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to provision instance");
        setActionLoading(false);
        return;
      }

      setInstance(data.instance);
      setActionSuccess("Life instance provisioning started");
      startPolling(org.id);
    } catch {
      setActionError("Network error while provisioning");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Restart ─────────────────────────────────────────────────────────

  const handleRestart = async () => {
    if (!org) return;
    setActionError(null);
    setActionSuccess(null);
    setActionLoading(true);

    try {
      const res = await fetch("/api/platform/life", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to restart instance");
        setActionLoading(false);
        return;
      }

      setActionSuccess("Restart initiated for all services");
      // Refresh instance status
      await fetchInstance(org.id);
    } catch {
      setActionError("Network error while restarting");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Deprovision ─────────────────────────────────────────────────────

  const handleDeprovision = async () => {
    if (!org) return;
    setActionError(null);
    setActionSuccess(null);
    setActionLoading(true);
    setConfirmDeprovision(false);

    try {
      const res = await fetch("/api/platform/life", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setActionError(data.error ?? "Failed to deprovision instance");
        setActionLoading(false);
        return;
      }

      setInstance(null);
      setRailwayServices(null);
      setActionSuccess("Life instance deprovisioned successfully");
    } catch {
      setActionError("Network error while deprovisioning");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Refresh ─────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    if (!org) return;
    await fetchInstance(org.id);
  };

  // ── Render: Loading ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  // ── Render: No organization ─────────────────────────────────────────

  if (!org) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Deployments</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Managed Life Agent OS instance provisioning and health monitoring.
          </p>
        </div>
        <div className="glass-card text-center">
          <p className="text-text-secondary">
            You need to create an organization first.
          </p>
          <a
            href="/console/organization"
            className="glass-button mt-4 inline-flex items-center gap-2"
          >
            Go to Organization
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </div>
    );
  }

  // ── Render: Not enterprise plan ─────────────────────────────────────

  const isEnterprise = org.plan === "enterprise";

  if (!isEnterprise && !instance) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Deployments</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Managed Life Agent OS instance provisioning and health monitoring.
          </p>
        </div>
        <div className="glass-card">
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="rounded-full bg-[var(--ag-accent)]/10 p-4">
              <Rocket className="size-8 text-[var(--ag-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Managed Life Instances
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Deploy a fully managed Life Agent OS stack (Arcan, Lago, Autonomic,
                Haima) on dedicated infrastructure. Managed Life instances are
                available on the Enterprise plan.
              </p>
            </div>
            <a
              href="/pricing"
              className="glass-button inline-flex items-center gap-2"
            >
              <Zap className="size-4" />
              View Pricing
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: No instance yet (enterprise plan) ───────────────────────

  if (!instance) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Deployments</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Managed Life Agent OS instance provisioning and health monitoring.
          </p>
        </div>

        {actionError && (
          <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400">
            {actionSuccess}
          </div>
        )}

        <div className="glass-card">
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="rounded-full bg-[var(--ag-accent)]/10 p-4">
              <Rocket className="size-8 text-[var(--ag-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Deploy Life Agent OS
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                Provision a dedicated Life Agent OS stack for your organization.
                This deploys four services &mdash; Arcan (orchestration), Lago
                (memory), Autonomic (self-regulation), and Haima (finance) &mdash;
                on managed infrastructure.
              </p>
            </div>
            <button
              type="button"
              onClick={handleProvision}
              disabled={actionLoading}
              className="glass-button inline-flex items-center gap-2"
            >
              {actionLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Rocket className="size-4" />
              )}
              Deploy Life Agent OS
            </button>
          </div>
        </div>

        {/* Service overview */}
        <section className="glass-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <Server className="size-4" />
            Services Included
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SERVICES.map((svc) => {
              const Icon = svc.icon;
              return (
                <div
                  key={svc.key}
                  className="flex items-center gap-3 rounded-lg border border-[var(--ag-border-subtle)] p-3"
                >
                  <Icon className="size-5 text-text-muted" />
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {svc.name}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {svc.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // ── Render: Instance exists ─────────────────────────────────────────

  const statusCfg = STATUS_CONFIG[instance.status];
  const StatusIcon = statusCfg.icon;
  const isTransitioning =
    instance.status === "provisioning" || instance.status === "deprovisioning";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Deployments</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Managed Life Agent OS instance provisioning and health monitoring.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="glass-button"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Status messages */}
      {actionError && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-400">
          {actionSuccess}
        </div>
      )}

      {/* Instance Status Card */}
      <section className="glass-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <CircuitBoard className="size-4" />
            Life Instance
          </h2>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${statusCfg.color}`}>
            <StatusIcon
              className={`size-4 ${isTransitioning ? "animate-spin" : ""}`}
            />
            {statusCfg.label}
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Status</span>
            <span className={`font-medium ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Instance ID</span>
            <span className="font-mono text-xs text-text-primary">
              {instance.id}
            </span>
          </div>
          {instance.railwayProjectId && (
            <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
              <span className="text-text-secondary">Railway Project</span>
              <span className="font-mono text-xs text-text-primary">
                {instance.railwayProjectId}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
            <span className="text-text-secondary">Created</span>
            <span className="text-text-primary">
              {new Date(instance.createdAt).toLocaleString()}
            </span>
          </div>
          {instance.lastHealthCheck && (
            <div className="flex items-center justify-between border-b border-[var(--ag-border-subtle)] pb-2">
              <span className="text-text-secondary">Last Health Check</span>
              <span className="text-text-primary">
                {new Date(instance.lastHealthCheck).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRestart}
            disabled={actionLoading || isTransitioning}
            className="glass-button inline-flex items-center gap-2"
          >
            {actionLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Restart All Services
          </button>

          {!confirmDeprovision ? (
            <button
              type="button"
              onClick={() => setConfirmDeprovision(true)}
              disabled={actionLoading || isTransitioning}
              className="glass-button inline-flex items-center gap-2 text-red-400 hover:text-red-300"
            >
              <Trash2 className="size-4" />
              Deprovision
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">
                This will permanently destroy the instance. Are you sure?
              </span>
              <button
                type="button"
                onClick={handleDeprovision}
                disabled={actionLoading}
                className="glass-button inline-flex items-center gap-2 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
              >
                {actionLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Confirm Deprovision
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeprovision(false)}
                className="glass-button text-text-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Provisioning progress indicator */}
        {isTransitioning && (
          <div className="mt-4 rounded-md bg-yellow-500/5 border border-yellow-500/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <Loader2 className="size-4 animate-spin" />
              {instance.status === "provisioning"
                ? "Provisioning in progress. This page will update automatically."
                : "Deprovisioning in progress. Please wait."}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Polling every {PROVISION_POLL_MS / 1000} seconds...
            </p>
          </div>
        )}
      </section>

      {/* Service URLs */}
      <section className="glass-card">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          <Server className="size-4" />
          Service Endpoints
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SERVICES.map((svc) => {
            const url = instance[serviceUrlKey(svc.key)];
            const Icon = svc.icon;
            const railwaySvc = railwayServices?.find(
              (rs) =>
                rs.serviceName.toLowerCase().includes(svc.key) ||
                rs.serviceName.toLowerCase().includes(svc.key.slice(0, 4)),
            );

            return (
              <div
                key={svc.key}
                className="flex items-start gap-3 rounded-lg border border-[var(--ag-border-subtle)] p-3"
              >
                <Icon className="mt-0.5 size-5 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {svc.name}
                    </span>
                    {railwaySvc && (
                      <span
                        className={`text-xs ${
                          railwayStatusToMetric(railwaySvc.status) === "healthy"
                            ? "text-green-400"
                            : railwayStatusToMetric(railwaySvc.status) === "degraded"
                              ? "text-yellow-400"
                              : "text-text-muted"
                        }`}
                      >
                        {railwaySvc.status}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {svc.description}
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 truncate text-xs text-[var(--ag-accent)] hover:underline"
                    >
                      {url}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="mt-1 block text-xs text-text-muted">
                      No URL available
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Health Overview (MetricTile grid) */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
          Service Health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((svc) => {
            const railwaySvc = railwayServices?.find(
              (rs) =>
                rs.serviceName.toLowerCase().includes(svc.key) ||
                rs.serviceName.toLowerCase().includes(svc.key.slice(0, 4)),
            );

            // Check per-service health from lastHealthStatus if available
            const healthStatus =
              instance.lastHealthStatus as Record<string, { status?: string; latency_ms?: number }> | null;
            const svcHealth = healthStatus?.[svc.key];

            const status: MetricStatus = svcHealth?.status
              ? (svcHealth.status as MetricStatus)
              : railwaySvc
                ? railwayStatusToMetric(railwaySvc.status)
                : instance.status === "running"
                  ? "healthy"
                  : instance.status === "failed"
                    ? "down"
                    : "unconfigured";

            const latency = svcHealth?.latency_ms;

            return (
              <MetricTile
                key={svc.key}
                label={svc.name}
                value={
                  latency !== undefined
                    ? `${latency}ms`
                    : railwaySvc
                      ? railwaySvc.status
                      : status === "healthy"
                        ? "OK"
                        : "--"
                }
                status={status}
                sublabel={svc.description}
              />
            );
          })}
        </div>
      </section>

      {/* Per-service health details from lastHealthStatus */}
      {instance.lastHealthStatus && (
        <section className="glass-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            Health Details
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ag-border-subtle)] text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-2 pr-4">Service</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ag-border-subtle)]">
                {SERVICES.map((svc) => {
                  const healthStatus =
                    instance.lastHealthStatus as Record<
                      string,
                      { status?: string; latency_ms?: number }
                    > | null;
                  const svcHealth = healthStatus?.[svc.key];
                  const status = svcHealth?.status ?? "unknown";
                  const latency = svcHealth?.latency_ms;

                  return (
                    <tr key={svc.key}>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <svc.icon className="size-4 text-text-muted" />
                          <span className="text-text-primary">{svc.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`glass-badge ${
                            status === "healthy"
                              ? "text-green-400"
                              : status === "degraded"
                                ? "text-yellow-400"
                                : status === "down"
                                  ? "text-red-400"
                                  : "text-text-muted"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-text-primary">
                        {latency !== undefined ? `${latency}ms` : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {instance.lastHealthCheck && (
            <p className="mt-3 text-xs text-text-muted">
              Last checked:{" "}
              {new Date(instance.lastHealthCheck).toLocaleString()}
            </p>
          )}
        </section>
      )}

      {/* Failed instance: allow re-provision */}
      {instance.status === "failed" && (
        <div className="glass-card border-red-500/20 bg-red-500/5">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 size-5 text-red-400" />
            <div className="flex-1">
              <h3 className="font-medium text-red-400">
                Instance Provisioning Failed
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                The Life instance failed to provision or encountered an
                unrecoverable error. You can deprovision and try again.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleDeprovision}
                  disabled={actionLoading}
                  className="glass-button inline-flex items-center gap-2 text-sm"
                >
                  {actionLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Deprovision &amp; Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
