/**
 * Prosopon emitter — translates the `RealAgentRunner`'s internal `RunEvent`
 * stream into Prosopon envelopes. Server-only.
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
  makeEnvelope,
  type Envelope,
  type ProsoponEvent,
  type Scene,
  type SceneNode,
  ProsoponSession,
} from "@broomva/prosopon";
import type { RunEvent } from "./types";

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
}

/**
 * Stateful translator. Each agent turn produces one instance; it tracks the
 * current stream + tool ids so Updated/StreamChunk events reference the right
 * nodes.
 */
export class ProsoponEmitter {
  readonly session: ProsoponSession;
  readonly opts: EmitterOptions;
  private currentMessageId: string | null = null;
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
  }

  /**
   * Translate one RunEvent into one-or-more Envelopes. Yields envelopes in
   * the order they should hit the wire.
   */
  *translate(event: RunEvent): Generator<Envelope> {
    switch (event.type) {
      case "run_started":
        // Internal; scene reset already emitted.
        return;

      case "thinking_start": {
        const id = payloadString(event, "id") ?? this.nextMessageId();
        this.currentMessageId = id;
        const msgNode = freshNode(`msg-${id}`, {
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

      case "thinking_delta": {
        const id = payloadString(event, "id");
        if (!id) return;
        yield this.session.emit({
          type: "node_updated",
          id: `msg-${id}`,
          patch: {
            attrs: { thinking: payloadString(event, "text") ?? "" },
          },
        });
        return;
      }

      case "thinking_end": {
        const id = payloadString(event, "id");
        if (!id) return;
        yield this.session.emit({
          type: "node_updated",
          id: `msg-${id}`,
          patch: {
            lifecycle: {
              created_at: nowIso(),
              status: { kind: "resolved" },
            },
          },
        });
        return;
      }

      case "text_start": {
        const id = payloadString(event, "id") ?? this.nextMessageId();
        this.currentMessageId = id;
        const streamNodeId = `stream-${id}`;
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
        this.streamSeqByMessage.set(id, 0);
        return;
      }

      case "text_delta": {
        const id = payloadString(event, "id");
        const text = payloadString(event, "text") ?? "";
        if (!id) return;
        const seq = (this.streamSeqByMessage.get(id) ?? 0) + 1;
        this.streamSeqByMessage.set(id, seq);
        yield this.session.emit({
          type: "stream_chunk",
          id: `stream-${id}`,
          chunk: {
            seq,
            payload: { encoding: "text", text },
            final_: false,
          },
        });
        return;
      }

      case "text_end": {
        const id = payloadString(event, "id");
        if (!id) return;
        const seq = (this.streamSeqByMessage.get(id) ?? 0) + 1;
        this.streamSeqByMessage.set(id, seq);
        yield this.session.emit({
          type: "stream_chunk",
          id: `stream-${id}`,
          chunk: {
            seq,
            payload: { encoding: "text", text: "" },
            final_: true,
          },
        });
        return;
      }

      case "tool_call": {
        const callId = payloadString(event, "id") ?? `tc-${Date.now()}`;
        const name = payloadString(event, "name") ?? "unknown";
        const target = payloadString(event, "target") ?? "";
        const nodeId = `tool-${callId}`;
        this.toolNodeIdByCallId.set(callId, nodeId);
        let parsedArgs: unknown;
        try {
          parsedArgs = JSON.parse(payloadString(event, "args") ?? "{}");
        } catch {
          parsedArgs = { raw: payloadString(event, "args") ?? "" };
        }
        const toolNode = freshNode(nodeId, {
          type: "tool_call",
          name: target ? `${name}:${target}` : name,
          args: parsedArgs as Record<string, unknown>,
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

      case "tool_result": {
        const callId = payloadString(event, "id") ?? "";
        const nodeId = this.toolNodeIdByCallId.get(callId);
        if (!nodeId) return;
        const result = payloadString(event, "result") ?? "";
        yield this.session.emit({
          type: "node_updated",
          id: nodeId,
          patch: {
            intent: {
              type: "tool_result",
              success: true,
              payload: { text: result } as Record<string, unknown>,
            },
            lifecycle: {
              created_at: nowIso(),
              status: { kind: "resolved" },
            },
          },
        });
        return;
      }

      case "fs_op": {
        const path = payloadString(event, "path") ?? "";
        const op = payloadString(event, "op") ?? "write";
        const content = payloadString(event, "content") ?? "";
        const title = payloadString(event, "title") ?? "";
        const bytes = payloadNumber(event, "bytes") ?? content.length;
        const id = `fs-${++this.fsNodeCounter}`;
        const fsNode = freshNode(id, {
          type: "custom",
          kind: "fs.op",
          payload: {
            path,
            op,
            content,
            title,
            bytes,
          } as Record<string, unknown>,
        });
        yield this.session.emit({
          type: "node_added",
          parent: WORKSPACE_NODE_ID,
          node: fsNode,
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

      case "done": {
        const costCents = payloadNumber(event, "costCents") ?? 0;
        const inputTokens = payloadNumber(event, "inputTokens") ?? 0;
        const outputTokens = payloadNumber(event, "outputTokens") ?? 0;
        const elapsedMs = payloadNumber(event, "elapsedMs") ?? 0;
        const total =
          (this.opts.priorCostCents ?? 0) + costCents;
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
        // Surface as a Confirm intent with danger severity under chat —
        // compositors decide whether to render a toast, modal, inline block.
        const message = payloadString(event, "message") ?? "unknown error";
        const errNode = freshNode(`err-${Date.now().toString(36)}`, {
          type: "confirm",
          message,
          severity: "danger",
        });
        yield this.session.emit({
          type: "node_added",
          parent: CHAT_NODE_ID,
          node: errNode,
        });
        return;
      }

      default:
        // Unknown RunEvent — ignore (forward-compat).
        return;
    }
  }

  /** Emit a heartbeat. Callers may send every ~5s to indicate liveness. */
  heartbeat(): Envelope {
    return this.session.emit({
      type: "heartbeat",
      ts: nowIso(),
    });
  }

  private nextMessageId(): string {
    return `m-${Date.now().toString(36)}`;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function payloadString(ev: RunEvent, key: string): string | undefined {
  const v = (ev.payload as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : undefined;
}

function payloadNumber(ev: RunEvent, key: string): number | undefined {
  const v = (ev.payload as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
}
