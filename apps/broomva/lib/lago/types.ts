/**
 * Lago Console — shared types for the managed lakehouse platform.
 *
 * These mirror the Rust types from lago-api and are used across
 * all Lago Console pages and components.
 */

// ── Sessions ────────────────────────────────────────────────────

export interface LagoSession {
  session_id: string;
  name: string;
  model: string;
  created_at: number;
  branches: string[];
}

export type SessionTier = "public" | "vault" | "agent" | "default";

export function classifySessionTier(name: string): SessionTier {
  if (name.startsWith("site-assets:") || name.startsWith("site-content:"))
    return "public";
  if (name.startsWith("vault:")) return "vault";
  if (name.startsWith("agent:")) return "agent";
  return "default";
}

export const TIER_COLORS: Record<SessionTier, string> = {
  public: "bg-emerald-500/20 text-emerald-400",
  vault: "bg-blue-500/20 text-blue-400",
  agent: "bg-purple-500/20 text-purple-400",
  default: "bg-zinc-500/20 text-zinc-400",
};

// ── Files & Manifest ────────────────────────────────────────────

export interface LagoManifestEntry {
  path: string;
  blob_hash: string;
  size_bytes: number;
  content_type: string | null;
  updated_at: number;
}

// ── Snapshots ───────────────────────────────────────────────────

export interface LagoSnapshot {
  name: string;
  branch: string;
  seq: number;
  created_at: number;
}

// ── Diff ────────────────────────────────────────────────────────

export type LagoDiffEntry =
  | { Added: { path: string; entry: LagoManifestEntry } }
  | { Removed: { path: string; entry: LagoManifestEntry } }
  | { Modified: { path: string; old: LagoManifestEntry; new: LagoManifestEntry } };

export function getDiffType(
  entry: LagoDiffEntry
): "added" | "removed" | "modified" {
  if ("Added" in entry) return "added";
  if ("Removed" in entry) return "removed";
  return "modified";
}

export function getDiffPath(entry: LagoDiffEntry): string {
  if ("Added" in entry) return entry.Added.path;
  if ("Removed" in entry) return entry.Removed.path;
  return entry.Modified.path;
}

// ── Health ───────────────────────────────────────────────────────

export interface LagoHealth {
  status: "ok" | "degraded";
  service: string;
  version: string;
  uptime_seconds: number;
  subsystems: {
    journal: "ok" | "error";
    blob_store: "ok" | "error";
    auth: "active" | "disabled";
    policy: {
      active: boolean;
      rules: number;
      roles: number;
    };
  };
  telemetry: {
    sdk: string;
    otlp_configured: boolean;
  };
}

// ── Events ──────────────────────────────────────────────────────

export interface LagoEvent {
  event_id: string;
  session_id: string;
  branch_id: string;
  seq: number;
  timestamp: number;
  payload: {
    type: string;
    [key: string]: unknown;
  };
}

// ── Metrics (parsed from Prometheus text format) ────────────────

export interface ParsedMetric {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export function parsePrometheusText(text: string): ParsedMetric[] {
  const metrics: ParsedMetric[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const match = line.match(
      /^(\w+)(?:\{([^}]*)\})?\s+([\d.eE+-]+(?:NaN)?)$/
    );
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const labels: Record<string, string> = {};
    if (labelsStr) {
      for (const pair of labelsStr.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) labels[k] = v.replace(/"/g, "");
      }
    }
    const value = Number.parseFloat(valueStr);
    if (!Number.isNaN(value)) {
      metrics.push({ name, labels, value });
    }
  }
  return metrics;
}
