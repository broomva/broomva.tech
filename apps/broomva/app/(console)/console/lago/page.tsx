import {
  ArrowUpRight,
  Database,
  GitBranch,
  LineChart,
  Lock,
  Package,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lago Console",
  description: "Lago storage engine dashboard",
};

const features = [
  {
    title: "Sessions",
    description:
      "Browse and manage Lago sessions, branches, and file trees.",
    icon: GitBranch,
    href: "/console/lago/sessions",
  },
  {
    title: "Blobs",
    description:
      "Inspect the content-addressable blob store and object hashes.",
    icon: Package,
    href: "/console/lago/blobs",
  },
  {
    title: "Policy",
    description:
      "View and manage RBAC policies, roles, and access rules.",
    icon: Lock,
    href: "/console/lago/policy",
  },
  {
    title: "Metrics",
    description:
      "Prometheus metrics, uptime, and telemetry for the Lago service.",
    icon: LineChart,
    href: "/console/lago/metrics",
  },
];

export default function LagoDashboardPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold flex items-center gap-2">
          <Database className="size-6" />
          Lago Console
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Storage engine dashboard — sessions, blobs, policy, and observability.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((feature) => (
          <a
            key={feature.title}
            href={feature.href}
            className="glass-card group flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <feature.icon className="size-5 text-ai-blue" />
              <h2 className="text-base font-semibold text-text-primary">
                {feature.title}
              </h2>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {feature.description}
            </p>
            <span className="mt-auto text-xs font-medium text-text-muted group-hover:text-ai-blue transition-colors">
              Coming soon
            </span>
          </a>
        ))}

        {/* Upgrade CTA card */}
        <a
          href="https://lago-platform.com"
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card group flex flex-col gap-3 border-emerald-500/30 bg-emerald-500/5 sm:col-span-2"
        >
          <div className="flex items-center gap-2">
            <ArrowUpRight className="size-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-text-primary">
              Upgrade to Lago Platform
            </h2>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            Unlimited sessions, full time-series metrics, alerting, team RBAC,
            and a dedicated SDK. Everything you need for production agent workloads.
          </p>
          <span className="mt-auto text-xs font-medium text-emerald-400 group-hover:text-emerald-300 transition-colors">
            lago-platform.com
          </span>
        </a>
      </div>
    </div>
  );
}
