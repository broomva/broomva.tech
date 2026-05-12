"use client";

import { Loader2, Lock, Shield, Webhook } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { LagoHealth, LagoSession } from "@/lib/lago/types";
import { classifySessionTier } from "@/lib/lago/types";

const LAGO_BASE =
  process.env.NEXT_PUBLIC_LAGO_URL ?? "https://api.lago.arcan.la";

export default function LagoPolicyPage() {
  const [health, setHealth] = useState<LagoHealth | null>(null);
  const [sessions, setSessions] = useState<LagoSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [hRes, sRes] = await Promise.allSettled([
        fetch(`${LAGO_BASE}/health`),
        fetch(`${LAGO_BASE}/v1/sessions`),
      ]);
      if (hRes.status === "fulfilled" && hRes.value.ok)
        setHealth(await hRes.value.json());
      if (sRes.status === "fulfilled" && sRes.value.ok)
        setSessions(await sRes.value.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tierCounts = sessions.reduce(
    (acc, s) => {
      const tier = classifySessionTier(s.name);
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold flex items-center gap-2">
          <Shield className="size-6 text-ai-blue" />
          Policy & RBAC
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Governance rules, roles, and access control for the Lago lakehouse.
        </p>
      </div>

      {/* Policy Engine Status */}
      <div className="glass-card">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Lock className="size-4" />
          Policy Engine
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-text-muted">Status</div>
            <div
              className={`text-sm font-medium ${health?.subsystems.policy.active ? "text-emerald-400" : "text-text-muted"}`}
            >
              {health?.subsystems.policy.active ? "Active" : "Disabled"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Rules</div>
            <div className="text-sm font-medium text-text-primary">
              {health?.subsystems.policy.rules ?? 0}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Roles</div>
            <div className="text-sm font-medium text-text-primary">
              {health?.subsystems.policy.roles ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* RBAC Tiers */}
      <div className="glass-card">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Webhook className="size-4" />
          Session Tiers
        </h2>
        <div className="space-y-2">
          {[
            {
              tier: "public",
              desc: "Anonymous read, authenticated write",
              color: "bg-emerald-500/20 text-emerald-400",
              prefixes: "site-assets:*, site-content:*",
            },
            {
              tier: "vault",
              desc: "Owner-only access (user vaults)",
              color: "bg-blue-500/20 text-blue-400",
              prefixes: "vault:*",
            },
            {
              tier: "agent",
              desc: "Owner-only access (agent workspaces)",
              color: "bg-purple-500/20 text-purple-400",
              prefixes: "agent:*",
            },
            {
              tier: "default",
              desc: "No additional RBAC restriction",
              color: "bg-zinc-500/20 text-zinc-400",
              prefixes: "any other name",
            },
          ].map((t) => (
            <div
              key={t.tier}
              className="flex items-center justify-between rounded-lg bg-bg-default/50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${t.color}`}
                >
                  {t.tier}
                </span>
                <div>
                  <div className="text-sm text-text-primary">{t.desc}</div>
                  <div className="text-xs text-text-muted font-mono">
                    {t.prefixes}
                  </div>
                </div>
              </div>
              <span className="text-sm font-medium text-text-primary">
                {tierCounts[t.tier] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Auth Status */}
      <div className="glass-card">
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          Authentication
        </h2>
        <div className="flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${health?.subsystems.auth === "active" ? "bg-emerald-400" : "bg-zinc-500"}`}
          />
          <span className="text-sm text-text-primary">
            JWT auth:{" "}
            {health?.subsystems.auth === "active"
              ? "enabled (HS256 shared secret)"
              : "disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
