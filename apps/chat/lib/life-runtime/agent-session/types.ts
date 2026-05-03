/**
 * Canonical agent-session contracts — TS mirror of `aios.v1.AgentEvent`
 * + `life.v1.Agent.StreamSession` from
 * `core/life/proto/life/v1/agent.proto`.
 *
 * The wire shape is the proto:
 *
 *   message AgentEvent {
 *     EventRecord record = 1;       // { session_id, sequence, at, kind, payload }
 *     AgentEventKind kind = 2;      // enum: TOKEN | TOOL_CALL_PENDING | TOOL_RESULT | …
 *   }
 *
 * The TS shape mirrors that envelope but decodes the `payload` bytes
 * into a typed discriminated union — so consumers (the runtime, the
 * Prosopon emitter, tests) write straightforward switches over
 * `event.kind` instead of parsing JSON-as-bytes inline.
 *
 * Both `AgentSessionClient` impls produce values of this shape:
 *   - InProcessAgentSessionClient: translates `RunnerYield` from
 *     `RealAgentRunner` into `CanonicalAgentEvent`.
 *   - LifedWsAgentSessionClient: decodes inbound WS frames from
 *     lifegw's `/v1/agent/stream` upgrade.
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import type {
  KernelContext,
  ResourceUsage,
  ToolCall,
  ToolResult,
  VmHandle,
} from "../kernel/types";

// ---------------------------------------------------------------------------
// AgentEvent — typed payload union
// ---------------------------------------------------------------------------

/**
 * One typed payload per `AgentEventKind`. Wire-side this is opaque
 * `bytes`, decoded from JSON on the receive path. The TS-side stays
 * native-typed so consumers can pattern-match.
 */
export type AgentEvent =
  /**
   * Session opened — emitted exactly once at the start of the stream.
   * Carries the VM handle so consumers can persist resume cursors.
   */
  | { kind: "open"; sessionId: string; vmHandle: VmHandle }
  /** Token delta — the LLM emitted text. */
  | { kind: "token"; delta: string }
  /** The model entered a thinking/reasoning block. */
  | { kind: "thinking_start" }
  /** The model exited the thinking block. `ms` is wall-clock duration. */
  | { kind: "thinking_end"; ms: number }
  /**
   * The agent decided to dispatch a tool. Pending approval if the
   * tool's policy requires it; otherwise immediately followed by a
   * `tool_result` after dispatch completes.
   */
  | { kind: "tool_call_pending"; call: ToolCall }
  /** A tool dispatch finished — carries `ResourceUsage` for billing. */
  | { kind: "tool_result"; result: ToolResult; usage?: ResourceUsage }
  /** Tool dispatch is paused awaiting human approval. */
  | { kind: "approval_required"; dispatchId: string; preview: string }
  /** A tool wrote to or read from the workspace. Drives the file-tree pane. */
  | { kind: "fs_op"; path: string; op: "read" | "write"; bytes?: number }
  /** Nous self-eval — drives the Nous inspector pane. */
  | { kind: "nous_score"; dim: string; score: number; rationale?: string }
  /** Autonomic pillar note — drives the Autonomic inspector pane. */
  | {
      kind: "autonomic";
      pillar: "economic" | "cognitive" | "operational";
      note: string;
    }
  /**
   * Haima billing settled mid-run. Drives the Haima inspector pane.
   * `microcredits` is the canonical unit (1 USDC = 1_000_000 μc).
   */
  | {
      kind: "haima_billed";
      microcredits: number;
      rail: "credits" | "usdc-base" | "bre-b" | "stripe";
    }
  /** Vigil span summary. Drives the Vigil inspector pane. */
  | {
      kind: "vigil_span";
      name: string;
      durationMs: number;
      status: "ok" | "error";
    }
  /** A non-fatal runtime error. Distinct from the `error` AgentEventKind which is fatal. */
  | { kind: "warning"; code: string; message: string }
  /** Fatal error — the stream is about to close abnormally. */
  | { kind: "error"; code: string; message: string }
  /** Stream finished cleanly. Always the last event. */
  | {
      kind: "finish";
      reason: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        costCents?: number;
      };
    };

/**
 * One event with its sequence + timestamp envelope.
 *
 * `seq` is monotonic per session; `LifedWsAgentSessionClient` uses it
 * as the resume cursor on reconnect (sends `from_sequence: seq`). For
 * InProcess, sequences are assigned synthetically per yielded event.
 */
export interface CanonicalAgentEvent {
  /** Lifed-assigned sequence number; monotonic per session. */
  seq: bigint;
  /** ISO-8601 timestamp when lifed minted the record. */
  at: string;
  /** Decoded typed payload. */
  event: AgentEvent;
}

// ---------------------------------------------------------------------------
// AgentSessionClient — the canonical streaming-highway interface
// ---------------------------------------------------------------------------

export type AgentSessionBackendId = "in-process" | "lifed-ws" | string;

export interface AgentStreamInput {
  /** LifeSession.id. Persistent identity for the agent thread. */
  sessionId: string;
  /** ConsumerIdentity-derived agent id (`user:<userId>` or `agent:<id>`). */
  agentId: string;
  /** Project slug — resolves to system prompt + tools + model + billing. */
  projectSlug: string;
  /** The user's message for this turn. Empty string ⇒ resume / replay. */
  userMessage: string;
  /**
   * Resume cursor — when set, lifed replays from `seq + 1`. InProcess
   * ignores it (no replay log). Default: `0n` (fresh stream).
   */
  fromSequence?: bigint;
  /**
   * Existing VM handle for resume. When absent, the client creates a
   * fresh VM via the kernel client.
   */
  vm?: VmHandle;
  /** Conversation history rehydrated from Lago / DB. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** KernelContext threaded into every dispatch. */
  kernelCtx: KernelContext;
  /**
   * Tier-User capability JWT (Spec D L4-D5). Required for
   * `lifed-ws` backend; ignored by `in-process`. When absent,
   * `lifed-ws` will throw before opening the WS.
   */
  capability?: TierUserCap;
  /** Aborts the stream. */
  signal?: AbortSignal;
}

/**
 * Spec D Tier-User capability — minted by lifegw's
 * `/anima/custody/mint_session_cap` route. The session client passes
 * this as a Bearer subprotocol on the WS upgrade.
 */
export interface TierUserCap {
  /** Compact JWT, ES256 over the user's auth pubkey. */
  token: string;
  /** Unix-seconds expiry. */
  expiresAt: number;
}

export interface AgentSessionHealth {
  backendId: AgentSessionBackendId;
  reachable: boolean;
  detail?: string;
}

/**
 * The canonical streaming-highway interface. Every consumer of an
 * agent turn talks to this — the route, the runtime, tests.
 *
 * Spec C₂ §6 + Spec C₃ §6 define the wire-side bidi stream
 * (`Agent.StreamSession`); this TS interface is the consumer-side
 * abstraction over it.
 */
export interface AgentSessionClient {
  /** Stable backend identifier. Surfaces on OTel + health snapshots. */
  readonly backendId: AgentSessionBackendId;

  /**
   * Open one streaming agent turn. Yields one `CanonicalAgentEvent`
   * per server-side event until either:
   *
   * - The stream finishes (a `finish` or `error` event lands), OR
   * - The caller's `signal` aborts.
   *
   * Implementations MUST emit events in monotonic `seq` order and
   * MUST emit exactly one `finish` or `error` as the last event
   * before the iterator ends.
   */
  stream(input: AgentStreamInput): AsyncIterable<CanonicalAgentEvent>;

  /**
   * Cheap reachability probe — used by the `/api/life/health` endpoint
   * to drive the Dock SIM/LIVE/COMING badges. Implementations should
   * NOT open a full agent stream; cap at 2s.
   */
  health(): Promise<AgentSessionHealth>;
}
