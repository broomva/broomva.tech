/**
 * Life Agent OS Console — shared types
 */

export type ServiceStatus = "healthy" | "degraded" | "down" | "unconfigured";

export interface ServiceHealth {
  status: ServiceStatus;
  latency_ms: number;
}

export interface ConsoleHealth {
  arcan: ServiceHealth;
  lago: ServiceHealth;
  autonomic: ServiceHealth;
  haima: ServiceHealth;
  timestamp: string;
}

export interface AgentSession {
  id: string;
  created_at: string;
  status: "active" | "completed" | "failed";
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface AutonomicState {
  gating: {
    active_gates: number;
    passed: number;
    blocked: number;
  };
  projections: {
    horizon: string;
    confidence: number;
    trend: "improving" | "stable" | "declining";
  };
}

export interface FinancialState {
  balance: number;
  currency: string;
  monthly_burn: number;
  runway_months: number;
  last_updated: string;
}

// ── Sandbox ───────────────────────────────────────────────────────────────────

export type SandboxProvider = "vercel" | "e2b" | "local";
export type SandboxStatus =
  | "starting"
  | "running"
  | "snapshotted"
  | "stopped"
  | "failed";
export type SnapshotTrigger = "idle_reaper" | "manual" | "session_end" | "api";

export interface SandboxInstanceView {
  id: string;
  sandboxId: string;
  sessionId: string | null;
  agentId: string | null;
  provider: SandboxProvider;
  status: SandboxStatus;
  vcpus: number | null;
  memoryMb: number | null;
  persistent: boolean;
  execCount: number;
  lastExecAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxSnapshotView {
  id: string;
  snapshotId: string;
  trigger: SnapshotTrigger;
  sizeBytes: number | null;
  createdAt: string;
}

export interface SandboxMetrics {
  active: number;
  snapshotted: number;
  execs24h: number;
}
