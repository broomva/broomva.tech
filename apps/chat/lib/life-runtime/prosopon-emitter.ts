/**
 * Prosopon emitter — translates the `RealAgentRunner`'s output stream into
 * Prosopon envelopes. Server-only.
 *
 * The runner yields `RunnerYield` values discriminated on `kind`:
 *
 *   - `{ kind: "llm",    part: LLMStreamPart }` — AI SDK v6 `fullStream`
 *     parts passed through verbatim. We branch on `part.type` here; the
 *     full typed surface (toolCallId, providerMetadata, source/file/raw
 *     parts, etc.) is available with zero fidelity loss.
 *
 *   - `{ kind: "domain", event: DomainEvent }` — runtime-level events our
 *     agent emits on top of the LLM stream (fs_op, nous_score, autonomic_event,
 *     done, error). Small, stable, ours.
 *
 * The split replaces the earlier `RunEvent` union that re-encoded both
 * concerns; see `docs/superpowers/specs/2026-04-24-life-runner-aisdk-passthrough.md`.
 *
 * Scene scaffold on run start:
 *
 *   root (Section: "Life Runtime")
 *   ├─ chat       (Section: "Chat")
 *   ├─ workspace  (Section: "Workspace")
 *   └─ inspector  (Section: "Inspector")
 *
 * As the agent runs:
 *   - Each assistant turn → a Stream{kind:text} child of chat
 *   - Each text_delta     → StreamChunk on that stream
 *   - Each tool call      → a ToolCall child of chat, patched to ToolResult
 *                           when the result lands
 *   - Each fs_op          → a Custom{kind:"fs.write"} child of workspace
 *                           carrying {path, content, title, bytes} payload
 *   - nous_score / autonomic_event / cost → SignalChanged on topics
 *     nous.composite / autonomic.<pillar> / haima.spend.cents
 *   - Heartbeat every 5s between events so long-running turns don't look
 *     disconnected.
 *
 * Live cost signals are also emitted as a SignalChanged on every delta so
 * the Haima pane animates during streaming — not just at turn end.
 *
 * This module depends on @broomva/prosopon purely for types + helpers;
 * there's no runtime coupling to the Rust daemon today. When we deploy
 * prosopon-daemon, callers pipe these envelopes into its fanout instead of
 * writing them directly into SSE frames.
 */

import "server-only";
import {
  type Envelope,
  type ProsoponEvent,
  ProsoponSession,
  type Scene,
  type SceneNode,
} from "@broomva/prosopon";
import type { DomainEvent, LLMStreamPart, RunnerYield } from "./types";

// Stable node ids so downstream patches and callers can reference them.
export const SCENE_ROOT_ID = "root";
export const CHAT_NODE_ID = "chat";
export const WORKSPACE_NODE_ID = "workspace";
export const INSPECTOR_NODE_ID = "inspector";

const nowIso = (): string => new Date().toISOString();

function freshNode(id: string, intent: SceneNode["intent"]): SceneNode {
  return {
    id,
    intent,
    children: [],
    bindings: [],
    actions: [],
    attrs: {},
    lifecycle: { created_at: nowIso() },
  };
}

/**
 * Build the initial Scene sent on a scene_reset at run start.
 * The three Section children are permanent targets for NodeAdded events.
 */
export function makeInitialScene(args: {
  projectSlug: string;
  displayName: string;
  sceneId?: string;
}): Scene {
  const chat = freshNode(CHAT_NODE_ID, {
    type: "section",
    title: "Chat",
    collapsible: false,
  });
  const workspace = freshNode(WORKSPACE_NODE_ID, {
    type: "section",
    title: "Workspace",
    collapsible: false,
  });
  const inspector = freshNode(INSPECTOR_NODE_ID, {
    type: "section",
    title: "Inspector",
    collapsible: false,
  });
  const root = freshNode(SCENE_ROOT_ID, {
    type: "section",
    title: args.displayName,
    collapsible: false,
  });
  root.children = [chat, workspace, inspector];
  root.attrs = { project: args.projectSlug };
  return {
    id: args.sceneId ?? `scene-${args.projectSlug}-${Date.now().toString(36)}`,
    root,
    signals: {},
    hints: { density: "comfortable", intent_profile: "conversational" },
  };
}

export interface EmitterOptions {
  sessionId: string;
  projectSlug: string;
  displayName: string;
  paymentMode: string;
  /** Cumulative cost at turn-start, so we can emit live deltas on top. */
  priorCostCents?: number;
  /**
   * KernelClient backend identifier ("in-process" today). Broadcast once as
   * a `kernel.backend` signal on `runStarted()` so inspector panes know
   * which backend is producing the `vigil.dispatch.*` numbers.
   */
  kernelBackendId?: string;
}

/**
 * Stateful translator. Each agent turn produces one instance; it tracks the
 * current stream + tool ids so Updated/StreamChunk events reference the right
 * nodes.
 */
export class ProsoponEmitter {
  readonly session: ProsoponSession;
  readonly opts: EmitterOptions;
  private streamSeqByMessage = new Map<string, number>();
  private toolNodeIdByCallId = new Map<string, string>();
  private fsNodeCounter = 0;

  constructor(opts: EmitterOptions) {
    this.session = new ProsoponSession({ sessionId: opts.sessionId });
    this.opts = opts;
  }

  /**
   * Emit the initial envelopes for a new run — scene reset, run metadata
   * signals, starting cost.
   */
  *runStarted(): Generator<Envelope> {
    const scene = makeInitialScene({
      projectSlug: this.opts.projectSlug,
      displayName: this.opts.displayName,
    });
    yield this.session.emit({ type: "scene_reset", scene });

    // Static-for-this-turn signals — projectSlug, paymentMode — broadcast once.
    yield this.session.emit({
      type: "signal_changed",
      topic: "life.project.slug",
      value: { Scalar: this.opts.projectSlug } as unknown as Record<
        string,
        unknown
      >,
      ts: nowIso(),
    } as ProsoponEvent);

    yield this.session.emit({
      type: "signal_changed",
      topic: "haima.payment_mode",
      value: { Scalar: this.opts.paymentMode } as unknown as Record<
        string,
        unknown
      >,
      ts: nowIso(),
    } as ProsoponEvent);

    if (typeof this.opts.priorCostCents === "number") {
      yield this.session.emit({
        type: "signal_changed",
        topic: "haima.spend.cents",
        value: { Scalar: this.opts.priorCostCents } as unknown as Record<
          string,
          unknown
        >,
        ts: nowIso(),
      } as ProsoponEvent);
    }

    if (this.opts.kernelBackendId) {
      yield this.session.emit({
        type: "signal_changed",
        topic: "kernel.backend",
        value: { Scalar: this.opts.kernelBackendId } as unknown as Record<
          string,
          unknown
        >,
        ts: nowIso(),
      } as ProsoponEvent);
    }
  }

  /**
   * Emit an envelope for the user's turn-starting message.
   *
   * Rationale: `LifeRunEvent` is the source of truth for a session. If the
   * user's message doesn't flow through the envelope log, rehydration can't
   * reconstruct the user bubble without reading a separate column
   * (`LifeRun.inputText`). That breaks the single-source-of-truth invariant
   * and forces every replay surface (web, CLI, operator panel) to know about
   * the side-channel.
   *
   * Shape: a `node_added` under `CHAT_NODE_ID` with a `custom` intent
   * (`kind: "user.message"`, payload `{ text }`) and a stable id
   * `user-<turnId>` so diffing / retries are deterministic. We chose `custom`
   * over promoting `user_message` to a first-class Prosopon intent for now
   * because the change stays inside `apps/chat` (no `@broomva/prosopon` bump)
   * and forward-compat is trivial — the adapter already branches on
   * `custom.kind`.
   */
  userTurnStarted(args: { text: string; turnId: string }): Envelope {
    const node = freshNode(`user-${args.turnId}`, {
      type: "custom",
      kind: "user.message",
      payload: { text: args.text } as Record<string, unknown>,
    });
    return this.session.emit({
      type: "node_added",
      parent: CHAT_NODE_ID,
      node,
    });
  }

  /**
   * Translate one RunnerYield into one-or-more Envelopes. Branches on the
   * discriminator: LLM stream parts go through `translateLLMPart` (typed
   * switch over AI SDK's `TextStreamPart` union, no re-encoding); runtime
   * domain events go through `translateDomain`.
   */
  *translate(y: RunnerYield): Generator<Envelope> {
    if (y.kind === "llm") {
      yield* this.translateLLMPart(y.part);
      return;
    }
    yield* this.translateDomain(y.event);
  }

  /**
   * Translate one AI SDK `fullStream` part into Prosopon envelopes.
   *
   * Reads `part` fields directly — no string fallbacks, no unknown casts.
   * Anything AI SDK emits has a typed path here, including `toolCallId`
   * (for correct parallel-call correlation), `providerMetadata` (for
   * Claude thinking signatures), and first-class `source` / `file` / `raw`
   * variants that used to be silently dropped when they had no `RunEvent`
   * counterpart.
   */
  private *translateLLMPart(part: LLMStreamPart): Generator<Envelope> {
    switch (part.type) {
      case "reasoning-start": {
        // AI SDK gives us a stable `id` per reasoning block (multiple may
        // interleave in future thinking models). Node id `msg-<id>` lets
        // the client EnvelopeAdapter fold updates into the right bubble.
        const msgNode = freshNode(`msg-${part.id}`, {
          type: "section",
          title: "Reasoning",
          collapsible: true,
        });
        msgNode.lifecycle = {
          created_at: nowIso(),
          status: { kind: "pending" },
        };
        yield this.session.emit({
          type: "node_added",
          parent: CHAT_NODE_ID,
          node: msgNode,
        });
        return;
      }

      case "reasoning-delta": {
        yield this.session.emit({
          type: "node_updated",
          id: `msg-${part.id}`,
          patch: { attrs: { thinking: part.text } },
        });
        return;
      }

      case "reasoning-end": {
        yield this.session.emit({
          type: "node_updated",
          id: `msg-${part.id}`,
          patch: {
            lifecycle: {
              created_at: nowIso(),
              status: { kind: "resolved" },
            },
          },
        });
        return;
      }

      case "text-start": {
        const streamNodeId = `stream-${part.id}`;
        const streamNode = freshNode(streamNodeId, {
          type: "stream",
          id: streamNodeId,
          kind: "text",
        });
        yield this.session.emit({
          type: "node_added",
          parent: CHAT_NODE_ID,
          node: streamNode,
        });
        this.streamSeqByMessage.set(part.id, 0);
        return;
      }

      case "text-delta": {
        if (!part.text) return;
        const seq = (this.streamSeqByMessage.get(part.id) ?? 0) + 1;
        this.streamSeqByMessage.set(part.id, seq);
        yield this.session.emit({
          type: "stream_chunk",
          id: `stream-${part.id}`,
          chunk: {
            seq,
            payload: { encoding: "text", text: part.text },
            final_: false,
          },
        });
        return;
      }

      case "text-end": {
        const seq = (this.streamSeqByMessage.get(part.id) ?? 0) + 1;
        this.streamSeqByMessage.set(part.id, seq);
        yield this.session.emit({
          type: "stream_chunk",
          id: `stream-${part.id}`,
          chunk: {
            seq,
            payload: { encoding: "text", text: "" },
            final_: true,
          },
        });
        return;
      }

      case "tool-call": {
        // AI SDK v6 gives a stable `toolCallId` on both `tool-call` and
        // `tool-result` parts. We use it directly — no counter-based
        // correlation, which fixes parallel tool calls.
        const callId = part.toolCallId;
        const nodeId = `tool-${callId}`;
        this.toolNodeIdByCallId.set(callId, nodeId);
        const input = (part.input ?? {}) as Record<string, unknown>;
        const target =
          part.toolName === "note" && typeof input.slug === "string"
            ? input.slug
            : "";
        const displayName = target
          ? `praxis.${part.toolName}:${target}`
          : `praxis.${part.toolName}`;
        const toolNode = freshNode(nodeId, {
          type: "tool_call",
          name: displayName,
          args: input,
        });
        toolNode.lifecycle = {
          created_at: nowIso(),
          status: { kind: "pending" },
        };
        yield this.session.emit({
          type: "node_added",
          parent: CHAT_NODE_ID,
          node: toolNode,
        });
        return;
      }

      case "tool-result": {
        const nodeId = this.toolNodeIdByCallId.get(part.toolCallId);
        if (!nodeId) return;
        const resultText =
          typeof part.output === "string"
            ? part.output
            : JSON.stringify(part.output);
        yield this.session.emit({
          type: "node_updated",
          id: nodeId,
          patch: {
            intent: {
              type: "tool_result",
              success: true,
              payload: { text: resultText.slice(0, 800) } as Record<
                string,
                unknown
              >,
            },
            lifecycle: {
              created_at: nowIso(),
              status: { kind: "resolved" },
            },
          },
        });
        return;
      }

      case "tool-error": {
        // Mark the pending tool node as failed. The client Journal pane
        // renders this as a failed tool entry.
        const nodeId = this.toolNodeIdByCallId.get(part.toolCallId);
        if (!nodeId) return;
        const errMsg =
          part.error instanceof Error
            ? part.error.message
            : typeof part.error === "string"
              ? part.error
              : JSON.stringify(part.error);
        yield this.session.emit({
          type: "node_updated",
          id: nodeId,
          patch: {
            intent: {
              type: "tool_result",
              success: false,
              payload: { text: errMsg } as Record<string, unknown>,
            },
            lifecycle: {
              created_at: nowIso(),
              status: { kind: "resolved" },
            },
          },
        });
        return;
      }

      case "error": {
        // Stream-level error from AI SDK (distinct from `tool-error`).
        const msg =
          part.error instanceof Error
            ? part.error.message
            : typeof part.error === "string"
              ? part.error
              : JSON.stringify(part.error);
        yield this.emitErrorNode(msg);
        return;
      }

      // -----------------------------------------------------------------
      // Intentional no-op parts. Tracked explicitly so future producers
      // don't fall through an untyped default and silently drop data we
      // later want to surface.
      // -----------------------------------------------------------------
      case "start":
      case "start-step":
      case "finish":
      case "finish-step":
      case "tool-input-start":
      case "tool-input-delta":
      case "tool-input-end":
      case "source":
      case "file":
      case "tool-approval-request":
      case "tool-output-denied":
      case "abort":
      case "raw":
        return;

      default: {
        // Forward-compat: unknown part type. Do nothing but keep the
        // exhaustiveness check disabled so AI SDK can add variants
        // without breaking our build.
        return;
      }
    }
  }

  /**
   * Translate one runtime-level `DomainEvent` into envelopes. These are
   * emitted by the runner *on top of* the AI SDK stream (workspace file
   * operations, Nous / Autonomic / cost aggregates) — not by the LLM.
   */
  private *translateDomain(event: DomainEvent): Generator<Envelope> {
    switch (event.type) {
      case "run_started":
        // Metadata-only; scene reset already emitted by emitter.runStarted().
        return;

      case "fs_op": {
        // RFC-0004: emit typed `Intent::FileRead` / `Intent::FileWrite` nodes
        // instead of `Custom { kind: "fs.op" }`. The EnvelopeAdapter on the
        // client side branches on the typed variant directly, but also keeps
        // a Custom-path branch for back-compat with any producer on <0.2.0.
        const path = payloadString(event, "path") ?? "";
        const rawOp = payloadString(event, "op") ?? "write";
        const content = payloadString(event, "content") ?? "";
        const title = payloadString(event, "title") ?? "";
        const bytes = payloadNumber(event, "bytes") ?? content.length;
        const hasContent = content.length > 0;

        const id = `fs-${++this.fsNodeCounter}`;

        if (rawOp === "read") {
          const readNode = freshNode(id, {
            type: "file_read",
            path,
            content: hasContent ? content : undefined,
            bytes: hasContent ? bytes : undefined,
          });
          yield this.session.emit({
            type: "node_added",
            parent: WORKSPACE_NODE_ID,
            node: readNode,
          });
          return;
        }

        // Everything else is a FileWrite — narrow to the FileWriteKind enum.
        // Unknown op strings fall back to `write` with a warning so the
        // emitter stays forward-compatible with server-side RunEvent evolution.
        let writeKind: "create" | "write" | "append" | "delete";
        switch (rawOp) {
          case "create":
          case "write":
          case "append":
          case "delete":
            writeKind = rawOp;
            break;
          default:
            writeKind = "write";
            break;
        }

        const writeNode = freshNode(id, {
          type: "file_write",
          path,
          op: writeKind,
          content:
            writeKind === "delete"
              ? undefined
              : hasContent
                ? content
                : undefined,
          bytes:
            writeKind === "delete" ? undefined : hasContent ? bytes : undefined,
          title: title ? title : undefined,
        });
        yield this.session.emit({
          type: "node_added",
          parent: WORKSPACE_NODE_ID,
          node: writeNode,
        });
        return;
      }

      case "nous_score": {
        yield this.session.emit({
          type: "signal_changed",
          topic: "nous.composite",
          value: {
            Scalar: payloadNumber(event, "score") ?? 0,
          } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        yield this.session.emit({
          type: "signal_changed",
          topic: "nous.band",
          value: {
            Scalar: payloadString(event, "band") ?? "unknown",
          } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        const note = payloadString(event, "note");
        if (typeof note === "string" && note.length > 0) {
          yield this.session.emit({
            type: "signal_changed",
            topic: "nous.note",
            value: { Scalar: note } as unknown as Record<string, unknown>,
            ts: nowIso(),
          } as ProsoponEvent);
        }
        return;
      }

      case "autonomic_event": {
        const pillar = payloadString(event, "pillar") ?? "unknown";
        const text = payloadString(event, "text") ?? "";
        yield this.session.emit({
          type: "signal_changed",
          topic: `autonomic.${pillar}.note`,
          value: { Scalar: text } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        return;
      }

      case "kernel.dispatch.started": {
        // Fires right after the AI SDK `tool-call` part. Broadcasts which
        // tool the kernel is about to run so the Vigil pane can show "tool
        // in flight" state without waiting for the dispatch to complete.
        const toolName = payloadString(event, "toolName") ?? "";
        if (toolName) {
          yield this.session.emit({
            type: "signal_changed",
            topic: "kernel.dispatch.tool",
            value: { Scalar: toolName } as unknown as Record<string, unknown>,
            ts: nowIso(),
          } as ProsoponEvent);
        }
        return;
      }

      case "kernel.dispatch.completed": {
        // Fires right after the AI SDK `tool-result` / `tool-error` part,
        // carrying the `ResourceUsage` populated by the kernel client.
        // Spec §4.3 defines `vigil.dispatch.duration_ms` /
        // `vigil.dispatch.egress_bytes` / `vigil.dispatch.confidence`;
        // `kernel.dispatch.tool` is emitted on the matching `started`
        // event so the four signals tile together in the inspector pane.
        const usage = extractUsage(event);
        if (usage) {
          yield this.session.emit({
            type: "signal_changed",
            topic: "vigil.dispatch.duration_ms",
            value: { Scalar: usage.durationMs } as unknown as Record<
              string,
              unknown
            >,
            ts: nowIso(),
          } as ProsoponEvent);
          yield this.session.emit({
            type: "signal_changed",
            topic: "vigil.dispatch.egress_bytes",
            value: { Scalar: usage.egressBytes } as unknown as Record<
              string,
              unknown
            >,
            ts: nowIso(),
          } as ProsoponEvent);
          yield this.session.emit({
            type: "signal_changed",
            topic: "vigil.dispatch.confidence",
            value: { Scalar: usage.confidence } as unknown as Record<
              string,
              unknown
            >,
            ts: nowIso(),
          } as ProsoponEvent);
        }
        return;
      }

      case "done": {
        const costCents = payloadNumber(event, "costCents") ?? 0;
        const inputTokens = payloadNumber(event, "inputTokens") ?? 0;
        const outputTokens = payloadNumber(event, "outputTokens") ?? 0;
        const elapsedMs = payloadNumber(event, "elapsedMs") ?? 0;
        const total = (this.opts.priorCostCents ?? 0) + costCents;
        yield this.session.emit({
          type: "signal_changed",
          topic: "haima.spend.cents",
          value: { Scalar: total } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        yield this.session.emit({
          type: "signal_changed",
          topic: "haima.last_turn.cents",
          value: { Scalar: costCents } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        yield this.session.emit({
          type: "signal_changed",
          topic: "vigil.tokens.input",
          value: { Scalar: inputTokens } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        yield this.session.emit({
          type: "signal_changed",
          topic: "vigil.tokens.output",
          value: { Scalar: outputTokens } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        yield this.session.emit({
          type: "signal_changed",
          topic: "vigil.duration.ms",
          value: { Scalar: elapsedMs } as unknown as Record<string, unknown>,
          ts: nowIso(),
        } as ProsoponEvent);
        return;
      }

      case "error": {
        yield this.emitErrorNode(
          payloadString(event, "message") ?? "unknown error",
        );
        return;
      }

      default:
        // Unknown DomainEvent — ignore (forward-compat).
        return;
    }
  }

  /**
   * Emit a danger-severity Confirm node under chat. Shared between the
   * AI-SDK `error` part handler and the `DomainEvent.error` handler so the
   * on-screen error surface is identical regardless of which layer raised it.
   */
  private emitErrorNode(message: string): Envelope {
    const errNode = freshNode(`err-${Date.now().toString(36)}`, {
      type: "confirm",
      message,
      severity: "danger",
    });
    return this.session.emit({
      type: "node_added",
      parent: CHAT_NODE_ID,
      node: errNode,
    });
  }

  /** Emit a heartbeat. Callers may send every ~5s to indicate liveness. */
  heartbeat(): Envelope {
    return this.session.emit({
      type: "heartbeat",
      ts: nowIso(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — narrow `DomainEvent.payload` (an opaque JSON record) to
// the string/number fields used by the translator. `DomainEvent` values flow
// through the runner → emitter wire as untyped-but-conventional blobs; these
// helpers keep the call sites readable without scattering `unknown` casts.
// ---------------------------------------------------------------------------

function payloadString(ev: DomainEvent, key: string): string | undefined {
  const v = (ev.payload as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : undefined;
}

function payloadNumber(ev: DomainEvent, key: string): number | undefined {
  const v = (ev.payload as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Narrow the opaque `kernel.dispatch.completed` payload to the
 * `ResourceUsage` shape. Returns undefined on missing/malformed data so the
 * emitter falls through to `kernel.dispatch.tool`-only signaling.
 */
interface ExtractedUsage {
  durationMs: number;
  egressBytes: number;
  confidence: string;
}

function extractUsage(ev: DomainEvent): ExtractedUsage | undefined {
  const raw = (ev.payload as Record<string, unknown> | undefined)?.usage;
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  // Require at least one expected field with a valid type; an empty `{}`
  // (or one with only unrelated keys) returns undefined so the emitter
  // skips dispatch signaling rather than emitting all-zero/"unknown" noise.
  const hasAny =
    typeof u.durationMs === "number" ||
    typeof u.egressBytes === "number" ||
    typeof u.confidence === "string";
  if (!hasAny) return undefined;
  return {
    durationMs: typeof u.durationMs === "number" ? u.durationMs : 0,
    egressBytes: typeof u.egressBytes === "number" ? u.egressBytes : 0,
    confidence: typeof u.confidence === "string" ? u.confidence : "unknown",
  };
}
