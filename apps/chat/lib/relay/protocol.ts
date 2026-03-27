/**
 * Life Relay wire protocol types — mirrors life-relay-core/src/protocol.rs
 */

// ── Session Types ─────────────────────────────────────────────────────────

export type SessionType = "arcan" | "claude-code" | "codex";
export type SessionStatus = "active" | "idle" | "completed" | "failed";

export interface SessionInfo {
  id: string;
  sessionType: SessionType;
  status: SessionStatus;
  name: string;
  workdir: string;
  model?: string;
  createdAt: string;
}

export interface SpawnConfig {
  name: string;
  workdir?: string;
  model?: string;
  sessionId?: string;
}

// ── Server → Daemon (commands) ────────────────────────────────────────────

export type ServerMessage =
  | { type: "spawn"; sessionType: SessionType; config: SpawnConfig }
  | { type: "input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | {
      type: "approve";
      sessionId: string;
      approvalId: string;
      approved: boolean;
    }
  | { type: "kill"; sessionId: string }
  | { type: "list_sessions" }
  | { type: "ping" };

// ── Daemon → Server (events) ──────────────────────────────────────────────

export type DaemonMessage =
  | { type: "output"; sessionId: string; data: string; seq: number }
  | { type: "assistant_message"; sessionId: string; text: string }
  | {
      type: "tool_event";
      sessionId: string;
      toolName: string;
      toolId: string;
      input: Record<string, unknown>;
    }
  | { type: "session_created"; session: SessionInfo }
  | { type: "session_ended"; sessionId: string; reason: string }
  | {
      type: "approval_request";
      sessionId: string;
      approvalId: string;
      capability: string;
      context: string;
    }
  | { type: "session_list"; sessions: SessionInfo[] }
  | {
      type: "node_info";
      name: string;
      hostname: string;
      capabilities: string[];
    }
  | {
      type: "workspace_status";
      sessionId: string;
      branch: string | null;
      modified: number;
      staged: number;
      lastCommit: string | null;
    }
  | { type: "pong" }
  | { type: "error"; code: string; message: string };
