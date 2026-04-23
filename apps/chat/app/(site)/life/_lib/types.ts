// Typed contracts for the /life UI surface.
// Layer 2 / 3 / 4 follow-up notes live in the project-map.ts and PR description.

export type ScenarioId = "refactor" | "ingest" | "research";

export type LayoutMode = "classic" | "experimental";
export type MiddleMode = "files" | "journal" | "timeline" | "graph" | "spaces";
export type RightMode =
  | "preview"
  | "vigil"
  | "nous"
  | "autonomic"
  | "haima"
  | "anima";
export type FsStyle = "finder" | "shimmer" | "heartbeat" | "ticker";
export type MetricsDensity = "minimal" | "medium" | "rich";

export interface TweaksState {
  layout: LayoutMode;
  middleMode: MiddleMode;
  rightMode: RightMode;
  fsStyle: FsStyle;
  journalRich: boolean;
  metricsDensity: MetricsDensity;
  orbs: boolean;
  scenario: ScenarioId;
  autoplay: boolean;
}

// ---- Replay scenario events ----

export type JournalKind =
  | "tool"
  | "fs"
  | "llm"
  | "nous"
  | "autonomic"
  | "haima";

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
  | { t: number; kind: "fs-op"; path: string; op: FsOpKind }
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

export type FsOpKind = "read" | "write" | "create" | "delete";

// ---- Replay state shape ----

export interface LifeTool {
  id: string;
  name: string;
  target: string;
  args: string;
  result: string | null;
  status: "running" | "ok";
  t: number;
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

// ---- Workspace mock data ----

export interface LifeFsNode {
  path: string;
  type: "dir" | "file";
  children?: LifeFsNode[];
}

export interface LifeTraceSpan {
  name: string;
  kind: "root" | "span" | "tool" | "llm";
  start: number;
  dur: number;
  color: "tool" | "llm" | "default";
}

export interface LifeHomeoPillar {
  value: number;
  target: number;
  sub: string;
}

export interface LifeHomeo {
  operational: LifeHomeoPillar;
  cognitive: LifeHomeoPillar;
  economic: LifeHomeoPillar;
}

export interface LifeHaima {
  session_spend: number;
  session_budget: number;
  tokens_in: number;
  tokens_out: number;
  x402_txs: number;
  last_pay: string;
}

export interface LifeJudge {
  axis: string;
  score: number;
  band: "good" | "warn";
  note: string;
}

export interface LifeAnima {
  name: string;
  soul: string;
  tier: string;
  did: string;
  beliefs: string[];
  trust: Record<string, number>;
  session: string;
}

export interface LifePeer {
  name: string;
  role: string;
  lat: number;
  status: string;
  hue: string;
}

export interface LifeGraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "concept" | "paper" | "artifact";
  r: number;
  fresh?: boolean;
}

export interface LifeGraphEdge {
  a: string;
  b: string;
  fresh?: boolean;
}

export interface LifeGraph {
  nodes: LifeGraphNode[];
  edges: LifeGraphEdge[];
}
