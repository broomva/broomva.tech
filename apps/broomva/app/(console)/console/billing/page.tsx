"use client";

import {
  ArrowUpRight,
  CheckIcon,
  CreditCard,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TierData {
  plan: string;
  organizationId: string | null;
  hasStripeCustomer: boolean;
  features: string[];
  limits: { maxApiKeys: number; maxMembers: number };
  credits: { remaining: number; monthly: number };
}

interface UsageData {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  periodStart: string;
  periodEnd: string;
}

// ---------------------------------------------------------------------------
// Plan catalogue (mirrors pricing page)
// ---------------------------------------------------------------------------

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    credits: "500 credits/mo",
    features: [
      "AI chat with community models",
      "500 AI credits included monthly",
      "Blog and writing access",
      "Basic conversation history",
    ],
    highlighted: false,
    purchasable: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    credits: "5,000 credits/mo",
    features: [
      "All AI models (Claude, GPT, Gemini, and more)",
      "5,000 AI credits included monthly",
      "Usage-based overage at $0.01/credit",
      "Console access with usage dashboard",
      "1 API key for programmatic access",
      "Deep research and agent skills",
    ],
    highlighted: true,
    purchasable: true,
  },
  {
    key: "team",
    name: "Team",
    price: "$50",
    period: "/seat/month",
    credits: "20,000 credits/mo",
    features: [
      "Everything in Pro",
      "20,000 AI credits included monthly",
      "Shared workspace and conversations",
      "Up to 10 API keys",
      "Priority model access",
      "Team member management",
    ],
    highlighted: false,
    purchasable: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    credits: "Unlimited credits",
    features: [
      "Everything in Team",
      "Managed Life Agent OS instance",
      "Custom subdomain (you.broomva.tech)",
      "Unlimited API keys",
      "SLA guarantees",
    ],
    highlighted: false,
    purchasable: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [tier, setTier] = useState<TierData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tierRes, usageRes] = await Promise.all([
        fetch("/api/tier", { cache: "no-store" }),
        fetch("/api/usage?period=month", { cache: "no-store" }),
      ]);

      if (!tierRes.ok) {
        setError("Could not load billing information");
        setLoading(false);
        return;
      }

      const tierData: TierData = await tierRes.json();
      setTier(tierData);

      if (usageRes.ok) {
        const usageData: UsageData = await usageRes.json();
        setUsage(usageData);
      }

      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -- Auto-trigger checkout from ?plan= query param (pricing page redirect)
  const searchParams = useSearchParams();
  const autoUpgradeTriggered = useRef(false);
  useEffect(() => {
    const planParam = searchParams.get("plan");
    if (planParam && tier?.organizationId && !autoUpgradeTriggered.current) {
      autoUpgradeTriggered.current = true;
      handleUpgrade(planParam);
    }
  }, [searchParams, tier]);

  // -- Upgrade handler
  async function handleUpgrade(plan: string) {
    if (!tier?.organizationId) return;
    setActionLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          organizationId: tier.organizationId,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to start checkout");
        setActionLoading(null);
      }
    } catch {
      setError("Failed to start checkout");
      setActionLoading(null);
    }
  }

  // -- Manage billing handler
  async function handleManageBilling() {
    if (!tier?.organizationId) return;
    setActionLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: tier.organizationId,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to open billing portal");
        setActionLoading(null);
      }
    } catch {
      setError("Failed to open billing portal");
      setActionLoading(null);
    }
  }

  // -- Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-text-muted" />
      </div>
    );
  }

  // -- Error state
  if (error && !tier) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass-card text-center text-text-secondary">
          {error}
        </div>
      </div>
    );
  }

  // -- No organization state
  if (!tier?.organizationId) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Billing</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your subscription and usage.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No organization found</CardTitle>
            <CardDescription>
              You need an organization to manage billing and subscriptions.
              Create one first to get started.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href={"/console/organization" as Route}>Create Organization</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const currentPlan = tier.plan;
  const creditsUsed = tier.credits.monthly - tier.credits.remaining;
  const creditPercent =
    tier.credits.monthly > 0
      ? Math.min(100, Math.round((creditsUsed / tier.credits.monthly) * 100))
      : 0;
  const isFreeTier = currentPlan === "free";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Billing</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your subscription, credits, and usage.
          </p>
        </div>
        {tier.hasStripeCustomer && (
          <Button
            variant="outline"
            onClick={handleManageBilling}
            disabled={actionLoading === "portal"}
          >
            {actionLoading === "portal" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4" />
            )}
            Manage Billing
          </Button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Free tier upgrade prompt */}
      {isFreeTier && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <CardTitle className="text-lg">
                Unlock the full platform
              </CardTitle>
            </div>
            <CardDescription>
              Upgrade to Pro for all AI models, 5,000 monthly credits, console
              access, API keys, and deep research capabilities.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={() => handleUpgrade("pro")}
              disabled={actionLoading === "pro"}
            >
              {actionLoading === "pro" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              Upgrade to Pro — $29/mo
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Current plan + credits */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Current Plan</CardTitle>
              <Badge variant={isFreeTier ? "secondary" : "default"}>
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
              </Badge>
            </div>
            <CardDescription>
              {isFreeTier
                ? "You are on the free tier with limited credits."
                : `You are subscribed to the ${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credits used</span>
                <span className="font-mono">
                  {creditsUsed.toLocaleString()} /{" "}
                  {tier.credits.monthly.toLocaleString()}
                </span>
              </div>
              <Progress value={creditPercent} />
              <p className="mt-1 text-xs text-muted-foreground">
                {tier.credits.remaining.toLocaleString()} credits remaining this
                period
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Usage This Period Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Usage This Period</CardTitle>
            <CardDescription>
              {usage
                ? `${new Date(usage.periodStart).toLocaleDateString()} — ${new Date(usage.periodEnd).toLocaleDateString()}`
                : "Current billing period"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usage ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">
                    Total Cost
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {formatCurrency(usage.totalCostCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">
                    Input Tokens
                  </span>
                  <span className="font-mono text-sm">
                    {formatTokens(usage.totalInputTokens)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Output Tokens
                  </span>
                  <span className="font-mono text-sm">
                    {formatTokens(usage.totalOutputTokens)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No usage data available yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plan Comparison */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
          Compare Plans
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            const isUpgrade =
              !isCurrent &&
              plan.purchasable &&
              PLANS.findIndex((p) => p.key === currentPlan) <
                PLANS.findIndex((p) => p.key === plan.key);

            return (
              <Card
                key={plan.key}
                className={
                  isCurrent
                    ? "border-primary"
                    : plan.highlighted
                      ? "border-primary/30"
                      : ""
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="default">Current</Badge>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs text-muted-foreground">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.credits}
                  </p>
                </CardHeader>
                <CardContent className="pb-3">
                  <ul className="space-y-1.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-1.5 text-xs"
                      >
                        <CheckIcon className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : isUpgrade ? (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={actionLoading === plan.key}
                    >
                      {actionLoading === plan.key ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ArrowUpRight className="size-3" />
                      )}
                      Upgrade
                    </Button>
                  ) : plan.key === "enterprise" ? (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <a href="mailto:contact@broomva.tech?subject=Enterprise%20Plan">
                        Contact Us
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled
                    >
                      {plan.key === "free" ? "Free Tier" : "Included"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How credits work footer */}
      <section className="rounded-lg border bg-muted/30 px-6 py-4">
        <h3 className="mb-2 text-sm font-semibold">How credits work</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Every AI request costs credits based on the model and tokens used. 1
          credit = $0.01. Your plan includes a monthly credit allocation. Pro and
          Team plans allow overage at $0.01/credit, billed via Stripe at the end
          of the billing period. Unused credits do not roll over.
        </p>
      </section>
    </div>
  );
}
