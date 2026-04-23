// Envelope → ReplayEvent adapter.
//
// Takes a Prosopon `Envelope<ProsoponEvent>` stream and maps it back into
// the legacy `ReplayEvent` stream the existing `applyReplayEvent` reducer
// understands. This is the inverse of `lib/life-runtime/prosopon-emitter.ts`
// — by round-tripping through the canonical Prosopon wire we prove both
// sides agree, AND we get to keep every pane unchanged.
//
// The adapter is stateful because a few signals have to be *paired* before
// the reducer sees a coherent event:
//   - `nous.composite` + `nous.band` + `nous.note` arrive as three separate
//     signal_changed envelopes but collapse into one `nous-score` ReplayEvent.
//   - `autonomic.<pillar>.note` is a last-value-wins signal. To preserve
//     the reducer's history semantics we append an `autonomic-event` event
//     only when the signal value actually changes.
//
// This is intentionally a pure data transform — zero DOM / React / fetch
// dependencies — so it's trivial to unit-test and run in any JS runtime.

import type {
  Envelope,
  ProsoponEvent,
  SceneNode,
  SignalValue,
} from "@broomva/prosopon";
import type { JournalKind, ReplayEvent } from "./types";

// ---------------------------------------------------------------------------
// Wire-level shapes we care about
// ---------------------------------------------------------------------------

/** Topics published by `prosopon-emitter.ts`. Centralised for lint-ability. */
export const TOPICS = {
  NOUS_COMPOSITE: "nous.composite",
  NOUS_BAND: "nous.band",
  NOUS_NOTE: "nous.note",
  HAIMA_SPEND: "haima.spend.cents",
  HAIMA_LAST_TURN: "haima.last_turn.cents",
  HAIMA_PAYMENT_MODE: "haima.payment_mode",
  VIGIL_TOKENS_IN: "vigil.tokens.input",
  VIGIL_TOKENS_OUT: "vigil.tokens.output",
  VIGIL_DURATION_MS: "vigil.duration.ms",
  LIFE_PROJECT_SLUG: "life.project.slug",
} as const;

/** Topic prefix for autonomic pillar notes: `autonomic.<pillar>.note`. */
const AUTONOMIC_PREFIX = "autonomic.";

type Pillar = "operational" | "cognitive" | "economic";
const PILLARS: readonly Pillar[] = ["operational", "cognitive", "economic"];

function isPillar(s: string): s is Pillar {
  return (PILLARS as readonly string[]).includes(s);
}

/**
 * Signal payloads from the emitter are wrapped as `{ Scalar: <value> }`.
 * Prosopon's wider SignalValue union supports Scalar / Array / Object /
 * Tensor; today the emitter only uses Scalar, so unwrapping that covers
 * 100% of cases. Future encodings would need explicit handling here.
 */
function unwrapScalar(v: SignalValue | undefined): string | number | boolean | null {
  if (!v || typeof v !== "object") return null;
  const scalar = (v as Record<string, unknown>).Scalar;
  if (typeof scalar === "string" || typeof scalar === "number" || typeof scalar === "boolean") {
    return scalar;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Meta surface — the hook cares about a handful of signals that don't map
// to ReplayEvents but DO drive the LiveRunMeta contract (cost, tokens, etc).
// We surface them on a separate channel so the hook can thread them into
// its meta state without tangling the replay stream.
// ---------------------------------------------------------------------------

export interface AdapterMetaEvent {
  kind: "cost-total" | "cost-turn" | "tokens-in" | "tokens-out" | "duration-ms" | "payment-mode";
  value: number | string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface AdapterOutput {
  /** Replay events to fold through `applyReplayEvent` in order. */
  replay: ReplayEvent[];
  /** Meta updates the hook should apply to its LiveRunMeta slot. */
  meta: AdapterMetaEvent[];
  /** True for `scene_reset` — the caller should zero out state first. */
  reset: boolean;
}

const EMPTY: AdapterOutput = { replay: [], meta: [], reset: false };

/**
 * Build an empty `AdapterOutput` (useful for adapter misses).
 */
function emptyOutput(): AdapterOutput {
  return { replay: [], meta: [], reset: false };
}

export class EnvelopeAdapter {
  // Pending-nous ensemble. The reducer wants a single `nous-score` event
  // with all three fields; signals arrive separately so we buffer.
  private nousScore: number | null = null;
  private nousBand: "good" | "warn" | null = null;
  private nousNote: string = "";

  // Last-seen value per autonomic pillar; we emit only on change.
  private lastAutonomic: Partial<Record<Pillar, string>> = {};

  /**
   * Translate one envelope. Returns the replay events to feed the reducer,
   * plus any meta-channel updates for the hook.
   */
  feed(envelope: Envelope, tMs: number): AdapterOutput {
    const ev = envelope.event as ProsoponEvent & { type: string };

    switch (ev.type) {
      case "scene_reset":
        this.resetState();
        return { ...emptyOutput(), reset: true };

      case "node_added":
        return this.onNodeAdded(ev, tMs);

      case "node_updated":
        return this.onNodeUpdated(ev, tMs);

      case "node_removed":
        // No legacy ReplayEvent corresponds to node removal. We'd have to
        // reconcile on the reducer side (e.g. remove a message). Rare in
        // the current server emitter — log once and pass through.
        return emptyOutput();

      case "signal_changed":
        return this.onSignalChanged(ev, tMs);

      case "stream_chunk":
        return this.onStreamChunk(ev, tMs);

      case "heartbeat":
      case "action_emitted":
        return emptyOutput();

      default:
        return emptyOutput();
    }
  }

  private resetState(): void {
    this.nousScore = null;
    this.nousBand = null;
    this.nousNote = "";
    this.lastAutonomic = {};
  }

  // -------------------------------------------------------------------------
  // Scene-mutating events
  // -------------------------------------------------------------------------

  private onNodeAdded(
    ev: Extract<ProsoponEvent, { type: "node_added" }>,
    tMs: number,
  ): AdapterOutput {
    const node = ev.node as SceneNode;
    const intent = node.intent as { type: string } & Record<string, unknown>;
    switch (intent.type) {
      case "section": {
        // "Reasoning" sections are thinking blocks. The emitter prefixes the
        // node id with "msg-<original-id>"; we strip it so the reducer's
        // id-keyed bookkeeping matches the server-side thinking id.
        if (intent.title === "Reasoning" && node.id.startsWith("msg-")) {
          return {
            ...emptyOutput(),
            replay: [
              { t: tMs, kind: "agent-thinking-start", id: node.id.slice(4) },
            ],
          };
        }
        return emptyOutput();
      }
      case "stream": {
        // Text streams — seed an empty agent-text message keyed on the
        // originating message id (stream id = "stream-<id>").
        if ((intent as { kind?: string }).kind === "text" && node.id.startsWith("stream-")) {
          return {
            ...emptyOutput(),
            replay: [
              {
                t: tMs,
                kind: "agent-text-start",
                id: node.id.slice(7),
                text: "",
              },
            ],
          };
        }
        return emptyOutput();
      }
      case "tool_call": {
        // Tool call node id is "tool-<callId>". Recover the raw callId so
        // the matching tool-result ReplayEvent targets the same bucket.
        const callId = node.id.startsWith("tool-") ? node.id.slice(5) : node.id;
        const name = (intent as { name?: string }).name ?? "unknown";
        const [bare, target = ""] = name.includes(":") ? name.split(":", 2) : [name];
        const args = (intent as { args?: unknown }).args ?? {};
        return {
          ...emptyOutput(),
          replay: [
            {
              t: tMs,
              kind: "tool-call",
              id: callId,
              name: bare ?? name,
              target,
              args: typeof args === "string" ? args : JSON.stringify(args),
              journalKind: inferJournalKind(bare ?? name),
            },
          ],
        };
      }
      case "custom": {
        // Only `fs.op` today — the workspace / filesystem view.
        if ((intent as { kind?: string }).kind !== "fs.op") return emptyOutput();
        const payload = ((intent as { payload?: unknown }).payload ?? {}) as Record<
          string,
          unknown
        >;
        const path = typeof payload.path === "string" ? payload.path : "";
        const op = typeof payload.op === "string" ? payload.op : "write";
        return {
          ...emptyOutput(),
          replay: [
            {
              t: tMs,
              kind: "fs-op",
              path,
              op: (op as "read" | "write" | "create" | "delete") ?? "write",
              content: typeof payload.content === "string" ? payload.content : undefined,
              title: typeof payload.title === "string" ? payload.title : undefined,
              bytes: typeof payload.bytes === "number" ? payload.bytes : undefined,
            },
          ],
        };
      }
      case "confirm":
        // Error surfaces — non-fatal for the replay stream. Hook tracks
        // failures via its status field.
        return emptyOutput();
      default:
        return emptyOutput();
    }
  }

  private onNodeUpdated(
    ev: Extract<ProsoponEvent, { type: "node_updated" }>,
    tMs: number,
  ): AdapterOutput {
    const patch = ev.patch as Record<string, unknown>;
    const id = ev.id;

    // msg-<id> being updated with lifecycle resolved → thinking_end.
    if (id.startsWith("msg-")) {
      const origId = id.slice(4);
      const attrs = patch.attrs as Record<string, unknown> | undefined;
      const lifecycle = patch.lifecycle as { status?: { kind?: string } } | undefined;
      const events: ReplayEvent[] = [];
      if (attrs && typeof attrs.thinking === "string") {
        events.push({ t: tMs, kind: "thinking", id: origId, text: attrs.thinking });
      }
      if (lifecycle?.status?.kind === "resolved") {
        events.push({ t: tMs, kind: "agent-thinking-end", id: origId });
      }
      return { ...emptyOutput(), replay: events };
    }

    // tool-<callId> becoming ToolResult → tool-result event.
    if (id.startsWith("tool-")) {
      const callId = id.slice(5);
      const newIntent = patch.intent as
        | { type?: string; payload?: Record<string, unknown> }
        | undefined;
      if (newIntent?.type === "tool_result") {
        const text =
          typeof newIntent.payload?.text === "string"
            ? newIntent.payload.text
            : JSON.stringify(newIntent.payload ?? {});
        return {
          ...emptyOutput(),
          replay: [
            { t: tMs, kind: "tool-result", id: callId, result: text },
          ],
        };
      }
    }

    return emptyOutput();
  }

  // -------------------------------------------------------------------------
  // Streaming
  // -------------------------------------------------------------------------

  private onStreamChunk(
    ev: Extract<ProsoponEvent, { type: "stream_chunk" }>,
    tMs: number,
  ): AdapterOutput {
    // Map stream-<id> → append to message id <id>.
    const streamId = (ev as unknown as { id: string }).id;
    const chunk = (ev as unknown as {
      chunk: { payload?: { text?: string }; final_?: boolean };
    }).chunk;
    const msgId = streamId.startsWith("stream-") ? streamId.slice(7) : streamId;
    const text = chunk?.payload?.text ?? "";
    if (!text) return emptyOutput();
    return {
      ...emptyOutput(),
      replay: [{ t: tMs, kind: "agent-text-append", id: msgId, text }],
    };
  }

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------

  private onSignalChanged(
    ev: Extract<ProsoponEvent, { type: "signal_changed" }>,
    tMs: number,
  ): AdapterOutput {
    const topic = (ev as unknown as { topic: string }).topic;
    const value = unwrapScalar((ev as unknown as { value: SignalValue }).value);

    // Haima / vigil / meta signals flow to the meta channel, not replay.
    switch (topic) {
      case TOPICS.HAIMA_SPEND:
        return {
          ...emptyOutput(),
          meta: typeof value === "number" ? [{ kind: "cost-total", value }] : [],
        };
      case TOPICS.HAIMA_LAST_TURN:
        return {
          ...emptyOutput(),
          meta: typeof value === "number" ? [{ kind: "cost-turn", value }] : [],
        };
      case TOPICS.VIGIL_TOKENS_IN:
        return {
          ...emptyOutput(),
          meta: typeof value === "number" ? [{ kind: "tokens-in", value }] : [],
        };
      case TOPICS.VIGIL_TOKENS_OUT:
        return {
          ...emptyOutput(),
          meta: typeof value === "number" ? [{ kind: "tokens-out", value }] : [],
        };
      case TOPICS.VIGIL_DURATION_MS:
        return {
          ...emptyOutput(),
          meta: typeof value === "number" ? [{ kind: "duration-ms", value }] : [],
        };
      case TOPICS.HAIMA_PAYMENT_MODE:
        return {
          ...emptyOutput(),
          meta: typeof value === "string" ? [{ kind: "payment-mode", value }] : [],
        };
      case TOPICS.LIFE_PROJECT_SLUG:
        return emptyOutput();
    }

    // Nous: buffer across three topics, emit once we have enough signal.
    if (topic === TOPICS.NOUS_COMPOSITE && typeof value === "number") {
      this.nousScore = value;
      return this.tryEmitNous(tMs);
    }
    if (topic === TOPICS.NOUS_BAND && typeof value === "string") {
      if (value === "good" || value === "warn") this.nousBand = value;
      return this.tryEmitNous(tMs);
    }
    if (topic === TOPICS.NOUS_NOTE && typeof value === "string") {
      this.nousNote = value;
      return this.tryEmitNous(tMs);
    }

    // Autonomic per-pillar notes: append only on change.
    if (topic.startsWith(AUTONOMIC_PREFIX) && topic.endsWith(".note") && typeof value === "string") {
      const pillar = topic.slice(AUTONOMIC_PREFIX.length, -".note".length);
      if (!isPillar(pillar)) return emptyOutput();
      if (this.lastAutonomic[pillar] === value) return emptyOutput();
      this.lastAutonomic[pillar] = value;
      return {
        ...emptyOutput(),
        replay: [{ t: tMs, kind: "autonomic-event", pillar, text: value }],
      };
    }

    return emptyOutput();
  }

  /**
   * Emit a `nous-score` ReplayEvent once we have at least score+band. The
   * note is optional (it may arrive shortly after the pair — on the next
   * emit cycle it will replace the existing state.nous through the reducer).
   */
  private tryEmitNous(tMs: number): AdapterOutput {
    if (this.nousScore === null || this.nousBand === null) return emptyOutput();
    return {
      ...emptyOutput(),
      replay: [
        {
          t: tMs,
          kind: "nous-score",
          score: this.nousScore,
          band: this.nousBand,
          note: this.nousNote,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mirror of the journal-kind classifier that the legacy server endpoint used
 * — keeps Journal column colours consistent when the same tool set shows up
 * through the Prosopon wire.
 */
function inferJournalKind(name: string): JournalKind {
  const lc = name.toLowerCase();
  if (lc.startsWith("fs.") || lc.startsWith("fs_") || lc.startsWith("read_file")) return "fs";
  if (lc.includes("judge") || lc.includes("nous")) return "nous";
  if (lc.startsWith("autonomic")) return "autonomic";
  if (lc.startsWith("haima") || lc.includes("payment")) return "haima";
  if (lc.startsWith("llm") || lc.includes("chat.complete")) return "llm";
  return "tool";
}
