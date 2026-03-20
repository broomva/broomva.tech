import type { Route } from "next";
import type { Metadata } from "next";
import Link from "next/link";
import {
  DollarSign,
  Layers,
  MessageSquare,
  Search,
} from "lucide-react";

import { ServiceHealthGrid } from "@/components/console/service-health-grid";

export const metadata: Metadata = {
  title: "Life Console",
  description: "Life Agent OS service dashboard",
};

const QUICK_LINKS = [
  {
    label: "Sessions",
    href: "/console/sessions",
    icon: MessageSquare,
    description: "Active agent sessions",
  },
  {
    label: "Memory",
    href: "/console/memory",
    icon: Search,
    description: "Search the knowledge graph",
  },
  {
    label: "Autonomic",
    href: "/console/autonomic",
    icon: Layers,
    description: "Gating & projections",
  },
  {
    label: "Finance",
    href: "/console/finance",
    icon: DollarSign,
    description: "Financial state",
  },
];

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Hero */}
      <div>
        <h1 className="font-heading text-2xl font-semibold">Life Console</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Monitor and manage your Life Agent OS services.
        </p>
      </div>

      {/* Service Health */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
          Service Health
        </h2>
        <ServiceHealthGrid />
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-text-muted">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href as Route}
                className="glass-card flex items-center gap-4 no-underline"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-bg-elevated">
                  <Icon className="size-5 text-ai-blue" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {link.label}
                  </div>
                  <div className="text-xs text-text-muted">
                    {link.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
