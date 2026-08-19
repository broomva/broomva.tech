"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, X } from "lucide-react";

type Variant = "ok" | "warn" | "no";

interface Props {
  label: string;
  variant?: Variant;
}

const VARIANT_STYLE: Record<Variant, { bg: string; fg: string; mark: LucideIcon }> =
  {
    ok: {
      bg: "color-mix(in oklab, var(--ag-success) 18%, transparent)",
      fg: "var(--ag-success)",
      mark: Check,
    },
    warn: {
      bg: "color-mix(in oklab, var(--ag-warning) 18%, transparent)",
      fg: "var(--ag-warning)",
      mark: AlertTriangle,
    },
    no: {
      bg: "color-mix(in oklab, var(--ag-text-muted) 12%, transparent)",
      fg: "var(--ag-text-muted)",
      mark: X,
    },
  };

/**
 * CapabilityChip — single ok/warn/no chip used inside AgentCard to surface
 * granted tool prefixes (fs.read, memory.write, …). Variants signal policy
 * stance: ok = granted, warn = granted but gated by approval, no = denied.
 */
export function CapabilityChip({ label, variant = "ok" }: Props) {
  const s = VARIANT_STYLE[variant];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
      style={{ background: s.bg, color: s.fg }}
    >
      <s.mark className="size-2.5" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
