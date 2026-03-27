"use client";

import {
  ArrowRightLeft,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";

import { EVENT_AGENT_DISCOVERED } from "@/lib/analytics/events";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceData {
  id: string;
  agentId: string;
  userId: string;
  name: string;
  description: string | null;
  category: string;
  pricing: { model: string; amount_micro_usd: number };
  endpoint: string | null;
  capabilities: string[] | null;
  trustMinimum: number;
  status: string;
  callCount: number;
  totalRevenue: number;
  createdAt: string;
  updatedAt: string;
  agentName: string | null;
  agentTrustScore: number | null;
  agentTrustLevel: string | null;
}

interface TransactionData {
  id: string;
  serviceId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  amountMicroUsd: number;
  facilitatorFeeMicroUsd: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

interface AgentOption {
  id: string;
  name: string;
  status: string;
}

const CATEGORIES = ["research", "code", "data", "creative", "finance"] as const;

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatMicroUsd(microUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(microUsd / 1_000_000);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function relativeTime(dateStr: string): string {
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

function pricingLabel(pricing: { model: string; amount_micro_usd: number }): string {
  const amount = formatMicroUsd(pricing.amount_micro_usd);
  switch (pricing.model) {
    case "per_call":
      return `${amount}/call`;
    case "per_token":
      return `${amount}/token`;
    case "fixed":
      return `${amount} fixed`;
    default:
      return amount;
  }
}

function trustBadgeVariant(
  level: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "platinum":
    case "gold":
      return "default";
    case "silver":
      return "secondary";
    case "bronze":
      return "outline";
    default:
      return "destructive";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MarketplacePage() {
  const posthog = usePostHog();
  const discoveredFired = useRef(false);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [myServices, setMyServices] = useState<ServiceData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"catalog" | "my-services" | "transactions">("catalog");

  // Create form state
  const [formAgentId, setFormAgentId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<string>("code");
  const [formPricingModel, setFormPricingModel] = useState<string>("per_call");
  const [formAmount, setFormAmount] = useState("");
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formCapabilities, setFormCapabilities] = useState("");
  const [formTrustMinimum, setFormTrustMinimum] = useState("0");

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("limit", "50");

      const [servicesRes, txRes, agentsRes] = await Promise.all([
        fetch(`/api/marketplace/services?${params}`, { cache: "no-store" }),
        fetch("/api/marketplace/transactions", { cache: "no-store" }),
        fetch("/api/agents", { cache: "no-store" }),
      ]);

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services ?? []);
      }

      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions ?? []);
      } else {
        // Transactions require auth — may 401 on initial load
        setTransactions([]);
      }

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        const agentList: AgentOption[] = data.agents ?? [];
        setAgents(agentList.filter((a) => a.status === "active"));

        // Filter services to find own services
        const agentIds = new Set(agentList.map((a: AgentOption) => a.id));
        if (servicesRes.ok) {
          const allServices: ServiceData[] =
            (await servicesRes.clone().json()).services ?? [];
          // Re-fetch with no filter for own services
          const ownRes = await fetch("/api/marketplace/services?limit=100", {
            cache: "no-store",
          });
          if (ownRes.ok) {
            const ownData = await ownRes.json();
            setMyServices(
              (ownData.services ?? []).filter((s: ServiceData) =>
                agentIds.has(s.agentId),
              ),
            );
          }
        }
      } else {
        setAgents([]);
      }

      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  const handleCreateService = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setCreating(true);

      try {
        const res = await fetch("/api/marketplace/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: formAgentId,
            name: formName,
            description: formDescription || undefined,
            category: formCategory,
            pricing: {
              model: formPricingModel,
              amount_micro_usd: Number.parseInt(formAmount, 10),
            },
            endpoint: formEndpoint || undefined,
            capabilities: formCapabilities
              ? formCapabilities.split(",").map((s) => s.trim())
              : undefined,
            trustMinimum: Number.parseInt(formTrustMinimum, 10),
          }),
        });

        if (res.ok) {
          setShowCreateForm(false);
          setFormName("");
          setFormDescription("");
          setFormAmount("");
          setFormEndpoint("");
          setFormCapabilities("");
          setFormTrustMinimum("0");
          await fetchAll();
        } else {
          const data = await res.json();
          setError(data.error ?? "Failed to create service");
        }
      } catch {
        setError("Failed to create service");
      } finally {
        setCreating(false);
      }
    },
    [
      formAgentId,
      formName,
      formDescription,
      formCategory,
      formPricingModel,
      formAmount,
      formEndpoint,
      formCapabilities,
      formTrustMinimum,
      fetchAll,
    ],
  );

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL.USAGE);
    return () => clearInterval(id);
  }, [fetchAll]);

  useEffect(() => {
    if (!loading && services.length > 0 && !discoveredFired.current) {
      discoveredFired.current = true;
      posthog?.capture(EVENT_AGENT_DISCOVERED, { resultCount: services.length });
    }
  }, [loading, services.length, posthog]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error && services.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="glass-card text-center text-text-secondary">{error}</div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------
  const totalServices = services.length;
  const ownServiceCount = myServices.length;
  const totalCalls = myServices.reduce((sum, s) => sum + s.callCount, 0);
  const totalRevenueMicro = myServices.reduce(
    (sum, s) => sum + s.totalRevenue,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Marketplace</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Discover and offer agent services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="glass-button"
          >
            {showCreateForm ? (
              <X className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {showCreateForm ? "Cancel" : "New Service"}
          </button>
          <button type="button" onClick={fetchAll} className="glass-button">
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="glass-card border-error/30 bg-error/5 text-sm text-error">
          {error}
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Available Services"
          value={String(totalServices)}
          sublabel="Active on marketplace"
          status="healthy"
        />
        <MetricTile
          label="My Services"
          value={String(ownServiceCount)}
          sublabel="Services you offer"
          status={ownServiceCount > 0 ? "healthy" : "unconfigured"}
        />
        <MetricTile
          label="Total Calls"
          value={formatNumber(totalCalls)}
          sublabel="Across your services"
          status="healthy"
        />
        <MetricTile
          label="Revenue"
          value={formatMicroUsd(totalRevenueMicro)}
          sublabel="Total earned"
          status={totalRevenueMicro > 0 ? "healthy" : "unconfigured"}
        />
      </div>

      {/* Create Service Form */}
      {showCreateForm && (
        <section className="glass-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <Plus className="size-4" />
            Register New Service
          </h2>
          <form onSubmit={handleCreateService} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Agent select */}
              <div>
                <label
                  htmlFor="agentId"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Agent
                </label>
                <select
                  id="agentId"
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Select an agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="serviceName"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Service Name
                </label>
                <input
                  id="serviceName"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  maxLength={256}
                  placeholder="e.g. Code Review Agent"
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                />
              </div>

              {/* Category */}
              <div>
                <label
                  htmlFor="category"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Category
                </label>
                <select
                  id="category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pricing model */}
              <div>
                <label
                  htmlFor="pricingModel"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Pricing Model
                </label>
                <select
                  id="pricingModel"
                  value={formPricingModel}
                  onChange={(e) => setFormPricingModel(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                >
                  <option value="per_call">Per Call</option>
                  <option value="per_token">Per Token</option>
                  <option value="fixed">Fixed Price</option>
                </select>
              </div>

              {/* Amount (micro-USD) */}
              <div>
                <label
                  htmlFor="amount"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Price (micro-USD)
                </label>
                <input
                  id="amount"
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                  min={1}
                  placeholder="e.g. 1000000 = $1.00"
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                />
              </div>

              {/* Trust Minimum */}
              <div>
                <label
                  htmlFor="trustMin"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Min Trust Score (0-100)
                </label>
                <input
                  id="trustMin"
                  type="number"
                  value={formTrustMinimum}
                  onChange={(e) => setFormTrustMinimum(e.target.value)}
                  min={0}
                  max={100}
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="mb-1 block text-sm text-text-secondary"
              >
                Description
              </label>
              <textarea
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="What does this service do?"
                className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Endpoint */}
              <div>
                <label
                  htmlFor="endpoint"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Endpoint URL (optional)
                </label>
                <input
                  id="endpoint"
                  type="url"
                  value={formEndpoint}
                  onChange={(e) => setFormEndpoint(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                />
              </div>

              {/* Capabilities */}
              <div>
                <label
                  htmlFor="capabilities"
                  className="mb-1 block text-sm text-text-secondary"
                >
                  Capabilities (comma-separated)
                </label>
                <input
                  id="capabilities"
                  type="text"
                  value={formCapabilities}
                  onChange={(e) => setFormCapabilities(e.target.value)}
                  placeholder="code-review, refactor, testing"
                  className="w-full rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="glass-button bg-ai-blue/10 text-ai-blue"
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Register Service
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark p-1">
        {(
          [
            { key: "catalog", label: "Service Catalog", icon: Store },
            { key: "my-services", label: "My Services", icon: Store },
            { key: "transactions", label: "Transactions", icon: ArrowRightLeft },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-bg-hover text-ai-blue"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Service Catalog */}
      {activeTab === "catalog" && (
        <section className="glass-card">
          {/* Category filter */}
          <div className="mb-4 flex items-center gap-2">
            <Filter className="size-4 text-text-muted" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-[var(--ag-border-subtle)] bg-bg-dark px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {services.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Trust</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead>Listed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{s.name}</span>
                          {s.description && (
                            <p className="mt-0.5 text-xs text-text-muted line-clamp-1">
                              {s.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.category}</Badge>
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {s.agentName ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={trustBadgeVariant(s.agentTrustLevel)}>
                          {s.agentTrustLevel ?? "unrated"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {pricingLabel(s.pricing)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(s.callCount)}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {relativeTime(s.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary">
                No services listed yet.
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Register the first service by clicking &ldquo;New Service&rdquo;
                above.
              </p>
            </div>
          )}
        </section>
      )}

      {/* My Services */}
      {activeTab === "my-services" && (
        <section className="glass-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <Store className="size-4" />
            Your Services
          </h2>

          {myServices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myServices.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "active" ? "default" : "destructive"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {pricingLabel(s.pricing)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(s.callCount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMicroUsd(s.totalRevenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary">
                You haven&apos;t registered any services yet.
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Click &ldquo;New Service&rdquo; to list a capability on the
                marketplace.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Transactions */}
      {activeTab === "transactions" && (
        <section className="glass-card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-text-muted">
            <ArrowRightLeft className="size-4" />
            Transaction History
          </h2>

          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">
                        {t.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.status === "completed"
                              ? "default"
                              : t.status === "failed" || t.status === "disputed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMicroUsd(t.amountMicroUsd)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-text-muted">
                        {formatMicroUsd(t.facilitatorFeeMicroUsd)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-text-secondary">
                        {t.buyerAgentId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="font-mono text-xs text-text-secondary">
                        {t.sellerAgentId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {relativeTime(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary">
                No transactions recorded yet.
              </p>
              <p className="mt-2 text-xs text-text-muted">
                Transactions appear here when agents invoke marketplace
                services.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
