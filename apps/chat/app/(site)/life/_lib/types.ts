// Typed contracts for the /life UI surface. Live-only — the legacy
// scenario-replay path + mock workspace are gone. Everything here is either
// (a) derived from a Prosopon envelope stream through EnvelopeAdapter, or
// (b) configuration the user controls from the Tweaks panel.

// ---- Pane modes (user-controllable from Tweaks) ----

export type MiddleMode = "files" | "journal" | "timeline" | "graph" | "spaces";
export type RightMode =
  | "preview"
  | "vigil"
  | "nous"
  | "autonomic"
  | "haima"
  | "anima";

// On mobile, the shell collapses to a single column. The user switches
// between the three "logical" columns — chat, workspace (middle), inspector
// (right) — via a bottom tab bar. Desktop shows all three in a grid.
export type MobileTab = "chat" | "workspace" | "inspector";

export interface TweaksState {
  middleMode: MiddleMode;
  rightMode: RightMode;
}

// ---- Live state events + shape ----

export type JournalKind =
  | "tool"
  | "fs"
  | "llm"
  | "nous"
  | "autonomic"
  | "haima";

/**
 * The filesystem ops the reducer + panes model. Aligned with RFC-0004's
 * `FileWriteKind` plus the read variant (`FileRead`). Adapter narrows the
 * Prosopon `op` into this shape.
 */
export type FsOpKind = "read" | "write" | "create" | "append" | "delete";

/**
 * Replay events feed the `applyReplayEvent` reducer. On the live wire they
 * are synthesized by `EnvelopeAdapter` from Prosopon envelopes — the shape
 * lives on for reducer convenience, not because it reflects the wire.
 */
export type ReplayEvent =
  | { t: number; kind: "user"; text: string }
  | { t: number; kind: "agent-thinking-start"; id: string }
  | { t: number; kind: "thinking"; id: string; text: string }
  | { t: number; kind: "agent-thinking-end"; id: string }
  | { t: number; kind: "agent-text-start"; id: string; text: string }
  | { t: number; kind: "agent-text-append"; id: string; text: string }
  | {
      t: number;
      kind: "tool-call";
      id: string;
      name: string;
      target: string;
      args: string;
      journalKind?: JournalKind;
    }
  | { t: number; kind: "tool-result"; id: string; result: string }
  | {
      t: number;
      kind: "fs-op";
      path: string;
      op: FsOpKind;
      content?: string;
      title?: string;
      bytes?: number;
    }
  | {
      t: number;
      kind: "nous-score";
      score: number;
      band: "good" | "warn";
      note: string;
    }
  | {
      t: number;
      kind: "autonomic-event";
      pillar: "operational" | "cognitive" | "economic";
      text: string;
    };

// ---- Reduced state shape — what the panes render ----

export interface LifeTool {
  id: string;
  name: string;
  target: string;
  args: string;
  result: string | null;
  status: "running" | "ok";
  t: number;
  /** Timestamp when tool_result landed — used by Vigil pane for duration. */
  endT?: number;
}

export interface LifeMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  thinking?: string;
  thinkingOpen?: boolean;
  complete: boolean;
  streamingThinking?: boolean;
  streamingText?: boolean;
  tools: LifeTool[];
}

export interface LifeFsOp {
  id: string;
  path: string;
  op: FsOpKind;
  t: number;
  /** Raw payload for Preview pane when the agent wrote a note. */
  content?: string;
  title?: string;
  bytes?: number;
}

export interface LifeJournalEntry {
  id: string;
  ts: string;
  kind: JournalKind;
  label: string;
  actor: string;
  msg: string;
  payload: string;
  linkToolId?: string;
}

export interface NousLive {
  score: number;
  band: "good" | "warn";
  note: string;
}

export interface AutonomicEvent {
  t: number;
  pillar: "operational" | "cognitive" | "economic";
  text: string;
}

export interface ReplayState {
  messages: LifeMessage[];
  fsOps: LifeFsOp[];
  journal: LifeJournalEntry[];
  nous: NousLive | null;
  autonomic: AutonomicEvent[];
  t: number;
}

// ---- File-tree node (live-derived only) ----

export interface LifeFsNode {
  path: string;
  type: "dir" | "file";
  children?: LifeFsNode[];
}
