/**
 * LifedWsAgentSessionClient — opens a WebSocket against
 * `${LIFED_GATEWAY_URL}/v1/agent/stream` and pumps `agent_event`
 * frames out as canonical `AgentEvent`s.
 *
 * Wire shape mirrors `core/life/sdks/life-sdk-ts/src/ws.ts` and
 * Spec C₃ §6 (lifegw WebSocket bridge to lifed
 * `Agent.StreamSession`):
 *
 *   Inbound (client → server):
 *     { kind: "send_message", content, attachment_blob_ref? }
 *     { kind: "approve_dispatch", dispatch_id }
 *     { kind: "cancel_dispatch", dispatch_id }
 *     { kind: "ping", seq_no? }
 *     { kind: "close", reason? }
 *
 *   Outbound (server → client):
 *     { kind: "agent_event", seq_no, record, agent_kind }
 *     { kind: "pong", seq_no }
 *     { kind: "closing", reason }
 *
 * Auth: the Tier-User cap (Spec D L4-D5) rides on
 * `Sec-WebSocket-Protocol: bearer.<jwt>` (M8.2 closure shipped in
 * D-Sub-C Stream R-2 / PR life#1084). Browser WS clients can't set
 * an `Authorization` header; the subprotocol is the workaround.
 *
 * This file vendors the minimal frame parser inline so broomva.tech
 * doesn't take a hard dep on `@broomva/life-sdk` (the SDK isn't yet
 * published to NPM and a `file:` link would break Vercel CI). When
 * the SDK ships to NPM, this file collapses into a thin wrapper.
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import "server-only";
import type { ToolCall, ToolResult, VmHandle } from "../kernel/types";
import {
  type AgentEvent,
  type AgentSessionClient,
  type AgentSessionHealth,
  AgentSessionUnknownSidError,
  type AgentStreamInput,
  type CanonicalAgentEvent,
  type TierUserCap,
} from "./types";

// ---------------------------------------------------------------------------
// Frame types — vendored from core/life/sdks/life-sdk-ts/src/ws.ts.
// Keep in sync when lifegw bumps Spec C₃ §6.
// ---------------------------------------------------------------------------

type OutboundFrame =
  | {
      kind: "agent_event";
      seq_no: string | number;
      /** Decoded `EventRecord` — { sequence, at, kind: string, payload: <typed> }. */
      record: AgentEventRecordPayload;
      agent_kind: AgentEventKindWire;
    }
  | { kind: "pong"; seq_no: string | number }
  | { kind: "closing"; reason: string };

type InboundFrame =
  | { kind: "send_message"; content: string; attachment_blob_ref?: string }
  | { kind: "approve_dispatch"; dispatch_id: string }
  | { kind: "cancel_dispatch"; dispatch_id: string }
  | { kind: "ping"; seq_no?: number }
  | { kind: "close"; reason?: string };

type AgentEventKindWire =
  | "AGENT_EVENT_KIND_TOKEN"
  | "AGENT_EVENT_KIND_TOOL_CALL_PENDING"
  | "AGENT_EVENT_KIND_TOOL_RESULT"
  | "AGENT_EVENT_KIND_APPROVAL_REQUIRED"
  | "AGENT_EVENT_KIND_FINISH"
  | "AGENT_EVENT_KIND_ERROR"
  | "AGENT_EVENT_KIND_HIBERNATE"
  | string;

/**
 * The `record.payload` field on the wire is `bytes` (per the proto)
 * but lifed today encodes it as JSON. The TS-side decoder treats
 * `record` as a JSON object whose shape varies per kind.
 */
interface AgentEventRecordPayload {
  sequence?: string | number;
  at?: string;
  kind?: string;
  payload?: unknown;
}

// ---------------------------------------------------------------------------
// WebSocket abstraction (tiny — mirrors browser global + `ws` package).
// ---------------------------------------------------------------------------

interface WsLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: "open", h: () => void): void;
  addEventListener(event: "message", h: (e: { data: unknown }) => void): void;
  addEventListener(event: "error", h: (e: { message?: string }) => void): void;
  addEventListener(
    event: "close",
    h: (e: { code: number; reason: string }) => void,
  ): void;
}

export type WebSocketFactory = (url: string, protocols: string[]) => WsLike;

function defaultWebSocketFactory(): WebSocketFactory {
  const g = globalThis as unknown as {
    WebSocket?: new (u: string, p?: string | string[]) => WsLike;
  };
  if (!g.WebSocket) {
    throw new Error(
      "lifed-ws: no WebSocket implementation available; pass `webSocketFactory` (Node: import { WebSocket } from 'ws')",
    );
  }
  const Ctor = g.WebSocket;
  return (url, protocols) => new Ctor(url, protocols);
}

// Spec C₃ §6.5 close-code policy (subset).
const CLOSE_NORMAL = 1000;
const CLOSE_GOING_AWAY = 1001;
const CLOSE_AUTH = 1008;
const CLOSE_INTERNAL = 1011;
const CLOSE_BACKPRESSURE = 4002;
const CLOSE_IP_BLOCKED = 4003;
const CLOSE_LIFED_DOWN = 4004;
const CLOSE_SEQUENCE_RETIRED = 4005;

const TRANSIENT_CLOSE_CODES: ReadonlySet<number> = new Set([
  CLOSE_BACKPRESSURE,
  CLOSE_LIFED_DOWN,
  CLOSE_INTERNAL,
  CLOSE_GOING_AWAY,
]);

// ---------------------------------------------------------------------------
// Errors surfaced from the unary `createSession` helper. Stage 3a.
// ---------------------------------------------------------------------------

export interface LifedCreateSessionErrorOpts {
  /** Stable error code — caller switches on this for retry policy. */
  code: string;
  /** Underlying cause for `.cause` chaining. */
  cause?: unknown;
  /** HTTP status when the failure came from a non-2xx response. */
  httpStatus?: number;
}

/**
 * Error thrown from `LifedWsAgentSessionClient.createSession`.
 *
 * Distinct from the `error` events the WS stream yields — this is a
 * synchronous failure of the unary HTTP call (network, 4xx/5xx,
 * malformed body). Callers translate it into a Prosopon
 * envelope or a route-level 5xx response.
 */
export class LifedCreateSessionError extends Error {
  readonly code: string;
  readonly httpStatus?: number;

  constructor(message: string, opts: LifedCreateSessionErrorOpts) {
    super(message, { cause: opts.cause });
    this.name = "LifedCreateSessionError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface LifedWsAgentSessionClientDeps {
  /** lifegw HTTPS base, e.g. `https://gw.broomva.life`. Required. */
  baseUrl: string;
  /** WebSocket factory. Defaults to `globalThis.WebSocket`. */
  webSocketFactory?: WebSocketFactory;
  /** Per-call request timeout for the `health()` probe. Default 2 s. */
  healthTimeoutMs?: number;
  /** Optional bearer token producer for the `health()` probe (uses Tier-2 if available). */
  healthTokenProducer?: () => Promise<string | undefined>;
  /** Override `fetch` (tests). */
  fetchFn?: typeof fetch;
}

/**
 * Lifed WebSocket-streaming agent session client. Active when
 * `LIFED_GATEWAY_URL` is set in the environment.
 */
export class LifedWsAgentSessionClient implements AgentSessionClient {
  readonly backendId = "lifed-ws" as const;
  private readonly baseUrl: string;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly healthTimeoutMs: number;
  private readonly healthTokenProducer?: () => Promise<string | undefined>;
  private readonly fetchFn: typeof fetch;

  constructor(deps: LifedWsAgentSessionClientDeps) {
    if (!deps.baseUrl) {
      throw new Error(
        "LifedWsAgentSessionClient: baseUrl is required (set LIFED_GATEWAY_URL)",
      );
    }
    this.baseUrl = deps.baseUrl.replace(/\/+$/, "");
    this.webSocketFactory = deps.webSocketFactory ?? defaultWebSocketFactory();
    this.healthTimeoutMs = deps.healthTimeoutMs ?? 2_000;
    this.healthTokenProducer = deps.healthTokenProducer;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  /**
   * Create a lifed-side session (Stage 3a — May 2026).
   *
   * lifed's `Agent.StreamSession` returns `not_found` when the sid
   * isn't already in its routing cache. The cache populates only after
   * a successful `Agent.CreateSession` (4-step saga: arcan create_agent
   * + lago open_namespace + haima bind_wallet + anima register_session).
   *
   * This helper POSTs to lifegw's `/v1/agent/create_session` HTTP/JSON
   * wrapper (see `core/life/crates/life-runtime/lifegw/src/services/agent_http.rs`).
   * Callers (canonical runtime) invoke this BEFORE `stream()` and use
   * the returned sid for the WS upgrade. The Tier-1 cap on `input.capability`
   * authenticates the call; lifegw verifies it via the same JWKS the
   * AuthLayer uses, mints a Tier-2 cap internally, and forwards to lifed.
   */
  async createSession(input: {
    capability: { token: string };
    userId: string;
    projectSlug: string;
    label?: string;
    resumeSid?: string;
    signal?: AbortSignal;
  }): Promise<{
    sid: string;
    agentId: string;
    userId: string;
    projectId: string;
    createdAtUnix: number;
  }> {
    const url = `${this.baseUrl}/v1/agent/create_session`;
    const body: Record<string, unknown> = {
      user_id: input.userId,
      project_id: input.projectSlug,
    };
    if (input.label && input.label.length > 0) body.label = input.label;
    if (input.resumeSid && input.resumeSid.length > 0)
      body.resume_sid = input.resumeSid;
    let resp: Response;
    try {
      resp = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.capability.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: input.signal,
      });
    } catch (err) {
      const e = err as Error;
      throw new LifedCreateSessionError(
        `network error reaching ${url}: ${e.message}`,
        { code: "lifed-ws.create_session.fetch_failed", cause: e },
      );
    }
    if (!resp.ok) {
      let detail = "";
      try {
        detail = await resp.text();
      } catch {
        // swallow — surface the status code regardless
      }
      throw new LifedCreateSessionError(
        `lifegw create_session returned HTTP ${resp.status}${
          detail ? ` — ${detail.slice(0, 256)}` : ""
        }`,
        {
          code: `lifed-ws.create_session.http_${resp.status}`,
          httpStatus: resp.status,
        },
      );
    }
    let parsed: {
      sid?: string;
      agent_id?: string;
      user_id?: string;
      project_id?: string;
      created_at_unix?: number;
    };
    try {
      parsed = (await resp.json()) as typeof parsed;
    } catch (err) {
      const e = err as Error;
      throw new LifedCreateSessionError(
        `lifegw create_session returned non-JSON body: ${e.message}`,
        { code: "lifed-ws.create_session.bad_response_body", cause: e },
      );
    }
    if (!parsed.sid || parsed.sid.length === 0) {
      throw new LifedCreateSessionError(
        "lifegw create_session response missing 'sid'",
        { code: "lifed-ws.create_session.missing_sid" },
      );
    }
    return {
      sid: parsed.sid,
      agentId: parsed.agent_id ?? "",
      userId: parsed.user_id ?? input.userId,
      projectId: parsed.project_id ?? input.projectSlug,
      createdAtUnix: parsed.created_at_unix ?? 0,
    };
  }

  /**
   * Multi-turn message ingestion. Implementation lands in Task 3 of
   * Plan E-2. Until then, calling this on an active session throws —
   * the per-turn path doesn't register a per-sid WS map entry.
   */
  async sendMessage(sessionId: string, _content: string): Promise<void> {
    throw new AgentSessionUnknownSidError(sessionId);
  }

  async health(): Promise<AgentSessionHealth> {
    const url = `${this.baseUrl}/healthz`;
    const headers: Record<string, string> = {};
    try {
      const tok = await this.healthTokenProducer?.();
      if (tok) headers.Authorization = `Bearer ${tok}`;
    } catch {
      // swallow — health probe must not depend on auth
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.healthTimeoutMs);
      const resp = await this.fetchFn(url, {
        method: "GET",
        headers,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!resp.ok) {
        return {
          backendId: this.backendId,
          reachable: false,
          detail: `lifegw /healthz returned ${resp.status}`,
        };
      }
      return {
        backendId: this.backendId,
        reachable: true,
        detail: `lifegw at ${this.baseUrl}`,
      };
    } catch (err) {
      return {
        backendId: this.backendId,
        reachable: false,
        detail: `lifegw /healthz unreachable: ${(err as Error).message}`,
      };
    }
  }

  async *stream(input: AgentStreamInput): AsyncIterable<CanonicalAgentEvent> {
    if (!input.capability) {
      // Spec D L4-D5 mandates a Tier-User cap on the WS upgrade.
      // Without one the gateway rejects the upgrade with 1008.
      yield* this.errorThenFinish(
        0n,
        "lifed-ws.no_capability",
        "LifedWsAgentSessionClient requires a Tier-User capability (input.capability)",
      );
      return;
    }

    const wsUrl = this.buildWsUrl(input);
    const protocols = [`bearer.${input.capability.token}`];
    let ws: WsLike;
    try {
      ws = this.webSocketFactory(wsUrl, protocols);
    } catch (err) {
      yield* this.errorThenFinish(
        0n,
        "lifed-ws.factory_failed",
        `failed to construct WebSocket: ${(err as Error).message}`,
      );
      return;
    }

    // Bounded mpsc: server frames go in via the `message` listener,
    // the iterator drains them. We use a simple promise queue; if
    // backpressure is a concern in production, swap for a ring buffer.
    const queue: OutboundFrame[] = [];
    let closed = false;
    let resolveNext: ((v: void) => void) | null = null;
    const wake = () => {
      const r = resolveNext;
      resolveNext = null;
      r?.();
    };
    const waitForFrame = () =>
      new Promise<void>((resolve) => {
        if (queue.length > 0 || closed) return resolve();
        resolveNext = resolve;
      });

    let openedSent = false;
    let lastSeq = 0n;
    let openErrCode: string | null = null;
    let openErrMsg: string | null = null;

    const cleanup = () => {
      try {
        if (
          ws.readyState !== /* CLOSED */ 3 &&
          ws.readyState !== /* CLOSING */ 2
        ) {
          ws.close(CLOSE_NORMAL, "client done");
        }
      } catch {
        // swallow
      }
    };

    ws.addEventListener("open", () => {
      // Spec C₃ §6.4: send the first user message as a `send_message`
      // frame. lifed accepts it, sequence numbers start incrementing.
      const frame: InboundFrame = {
        kind: "send_message",
        content: input.userMessage,
      };
      try {
        ws.send(JSON.stringify(frame));
        openedSent = true;
      } catch (err) {
        openErrCode = "lifed-ws.send_failed";
        openErrMsg = `failed to send open frame: ${(err as Error).message}`;
        cleanup();
      }
    });

    ws.addEventListener("message", (e) => {
      const text = typeof e.data === "string" ? e.data : null;
      if (!text) return;
      try {
        const f = JSON.parse(text) as OutboundFrame;
        queue.push(f);
        wake();
      } catch {
        // malformed frame — drop. lifed should not produce these.
      }
    });

    ws.addEventListener("error", (e) => {
      openErrCode ??= "lifed-ws.transport_error";
      openErrMsg ??= e.message ?? "websocket error";
    });

    ws.addEventListener("close", (e) => {
      closed = true;
      if (e.code === CLOSE_AUTH) {
        openErrCode = "lifed-ws.auth";
        openErrMsg = `auth failed: ${e.reason || "1008"}`;
      } else if (e.code === CLOSE_IP_BLOCKED) {
        openErrCode = "lifed-ws.ip_blocked";
        openErrMsg = `ip blocked: ${e.reason || "4003"}`;
      } else if (e.code === CLOSE_SEQUENCE_RETIRED) {
        openErrCode = "lifed-ws.sequence_retired";
        openErrMsg = `from_sequence retired: ${e.reason || "4005"}`;
      } else if (TRANSIENT_CLOSE_CODES.has(e.code)) {
        // transient — surface as warning, but the run is over
        openErrCode ??= `lifed-ws.transient_${e.code}`;
        openErrMsg ??= `transient close: ${e.reason || e.code}`;
      } else if (e.code !== CLOSE_NORMAL) {
        openErrCode ??= `lifed-ws.unexpected_${e.code}`;
        openErrMsg ??= `unexpected close: ${e.reason || e.code}`;
      }
      wake();
    });

    // Yield events until the WS closes or the iterator is dropped.
    try {
      while (!closed || queue.length > 0) {
        if (input.signal?.aborted) {
          yield this.canonical(lastSeq++, {
            kind: "warning",
            code: "lifed-ws.aborted",
            message: "stream aborted by client",
          });
          break;
        }
        if (queue.length === 0) {
          await waitForFrame();
          continue;
        }
        const frame = queue.shift()!;
        if (frame.kind === "agent_event") {
          const seqStr = String(frame.seq_no);
          const seq = parseSeqStrict(seqStr) ?? lastSeq + 1n;
          lastSeq = seq;
          if (!openedSent) {
            // server should send agent_event only after upgrade, but be
            // defensive
          }
          const decoded = decodeAgentEvent(frame, input);
          if (decoded)
            yield {
              seq,
              at: frame.record.at ?? new Date().toISOString(),
              event: decoded,
            };
        } else if (frame.kind === "closing") {
          // server is about to close the stream (Spec C₃ §6.5). Don't
          // yield this — the close event will produce the finish.
        } else if (frame.kind === "pong") {
          // unsolicited; ignore
        }
      }
    } finally {
      cleanup();
      if (openErrCode || openErrMsg) {
        yield this.canonical(++lastSeq, {
          kind: "error",
          code: openErrCode ?? "lifed-ws.error",
          message: openErrMsg ?? "lifed-ws stream errored",
        });
        yield this.canonical(++lastSeq, {
          kind: "finish",
          reason: "error",
        });
      } else {
        // Normal close — if the server didn't send a FINISH event,
        // synthesize one so consumers don't hang.
        // (Idiomatic lifed always sends FINISH; this is belt-and-suspenders.)
        yield this.canonical(++lastSeq, {
          kind: "finish",
          reason: "stop",
        });
      }
    }
  }

  // ── helpers ────────────────────────────────────────────────────

  private buildWsUrl(input: AgentStreamInput): string {
    const wssBase = this.baseUrl.replace(/^https?:\/\//, (m) =>
      m === "https://" ? "wss://" : "ws://",
    );
    const params = new URLSearchParams({ sid: input.sessionId });
    if (input.fromSequence && input.fromSequence > 0n) {
      params.set("from_sequence", input.fromSequence.toString());
    }
    return `${wssBase}/v1/agent/stream?${params.toString()}`;
  }

  private canonical(seq: bigint, event: AgentEvent): CanonicalAgentEvent {
    return {
      seq,
      at: new Date().toISOString(),
      event,
    };
  }

  private errorThenFinish(
    seqStart: bigint,
    code: string,
    message: string,
  ): CanonicalAgentEvent[] {
    return [
      this.canonical(seqStart, { kind: "error", code, message }),
      this.canonical(seqStart + 1n, { kind: "finish", reason: "error" }),
    ];
  }
}

// ---------------------------------------------------------------------------
// Frame decoder
// ---------------------------------------------------------------------------

/**
 * Decode one `agent_event` frame into a typed `AgentEvent`.
 *
 * The wire shape is intentionally lenient (`record.payload` is opaque
 * JSON per Spec C₃ §6.2 sub-phase A); we extract the typed fields we
 * care about and fall through to `warning` on unknown kinds so the UI
 * keeps streaming.
 */
function decodeAgentEvent(
  frame: Extract<OutboundFrame, { kind: "agent_event" }>,
  ctx: AgentStreamInput,
): AgentEvent | null {
  const kind = frame.agent_kind;
  const payload = (frame.record.payload ?? {}) as Record<string, unknown>;

  switch (kind) {
    case "AGENT_EVENT_KIND_TOKEN": {
      const text =
        typeof payload.text === "string"
          ? payload.text
          : typeof payload.delta === "string"
            ? payload.delta
            : "";
      if (!text) return null;
      return { kind: "token", delta: text };
    }
    case "AGENT_EVENT_KIND_TOOL_CALL_PENDING": {
      const call: ToolCall = {
        callId: String(payload.call_id ?? payload.callId ?? ""),
        toolName: String(payload.tool_name ?? payload.toolName ?? ""),
        inputJson: stringifyMaybeJson(payload.input_json ?? payload.input),
        requestedCapabilities: Array.isArray(
          payload.requested_capabilities ?? payload.requestedCapabilities,
        )
          ? ((payload.requested_capabilities ??
              payload.requestedCapabilities) as string[])
          : [],
      };
      return { kind: "tool_call_pending", call };
    }
    case "AGENT_EVENT_KIND_TOOL_RESULT": {
      const result: ToolResult = {
        callId: String(payload.call_id ?? payload.callId ?? ""),
        toolName: String(payload.tool_name ?? payload.toolName ?? ""),
        outputJson: stringifyMaybeJson(payload.output_json ?? payload.output),
        isError: Boolean(payload.is_error ?? payload.isError ?? false),
      };
      return { kind: "tool_result", result };
    }
    case "AGENT_EVENT_KIND_APPROVAL_REQUIRED": {
      return {
        kind: "approval_required",
        dispatchId: String(payload.dispatch_id ?? payload.dispatchId ?? ""),
        preview: String(payload.preview ?? ""),
      };
    }
    case "AGENT_EVENT_KIND_FINISH": {
      const usage = payload.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cost_cents?: number;
          }
        | undefined;
      return {
        kind: "finish",
        reason: String(payload.finish_reason ?? payload.reason ?? "stop"),
        usage: usage
          ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              costCents: usage.cost_cents,
            }
          : undefined,
      };
    }
    case "AGENT_EVENT_KIND_ERROR": {
      return {
        kind: "error",
        code: String(payload.code ?? "lifed.error"),
        message: String(payload.message ?? "unknown error"),
      };
    }
    case "AGENT_EVENT_KIND_HIBERNATE": {
      return {
        kind: "warning",
        code: "lifed.hibernate",
        message: "session hibernated by lifed (unsupported on browser-side)",
      };
    }
    default: {
      // Unknown kind — surface as a warning so the UI can show "lifed
      // emitted an unrecognized event" without dropping the run.
      return {
        kind: "warning",
        code: "lifed-ws.unknown_kind",
        message: `unrecognized agent_kind="${kind}" (sid=${ctx.sessionId})`,
      };
    }
  }
}

function stringifyMaybeJson(v: unknown): string {
  if (v === undefined || v === null) return "{}";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

function parseSeqStrict(s: string): bigint | null {
  if (!s) return null;
  if (!/^[0-9]+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

// Re-export internal helpers for tests.
export const _internals = {
  decodeAgentEvent,
  parseSeqStrict,
  TRANSIENT_CLOSE_CODES,
  CLOSE_NORMAL,
  CLOSE_AUTH,
  CLOSE_INTERNAL,
};

// Acknowledge the cap shape so it's not an unused import on the
// types-only path.
const _capCheck: TierUserCap | undefined = undefined;
void _capCheck;
const _vmCheck: VmHandle | undefined = undefined;
void _vmCheck;
