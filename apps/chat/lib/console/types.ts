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
