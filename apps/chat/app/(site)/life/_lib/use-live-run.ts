// Live-run hook — drives the Life Interface UI from the real /api/life/run
// SSE stream. Mirrors useReplay's state contract so the three-column
// UI can swap between local scenario replay and real streaming by flag.
//
// Session model: the hook owns a `sessionId` that persists across turns.
// The Composer calls `sendMessage(text)` and the hook POSTs a new run
// with `{ sessionId, message }`. Successive messages continue the same
// session (agent remembers the conversation). Cost is tallied across
// all turns of the session for the Haima pane.
//
// Protocol: each SSE data frame is { type, payload, at } — the server
// drives this shape (see runner-dispatch.ts + real-runner.ts). We map
// back to ReplayEvent and fold via the shared applyReplayEvent reducer.

"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayEvent, ReplayState } from "./types";
import { EMPTY_REPLAY_STATE, applyReplayEvent } from "./use-replay";

// ---------------------------------------------------------------------------
// Wire-format event emitted by the server
// ---------------------------------------------------------------------------

interface ServerEvent {
  type: string;
  payload: Record<string, unknown>;
  at: string;
}

function toReplayEvent(server: ServerEvent, t: number): ReplayEvent | null {
  const p = server.payload as Record<string, unknown>;
  switch (server.type) {
    case "thinking_start":
      return { t, kind: "agent-thinking-start", id: String(p.id) };
    case "thinking_delta":
      return {
        t,
        kind: "thinking",
        id: String(p.id),
        text: String(p.text ?? ""),
      };
    case "thinking_end":
      return { t, kind: "agent-thinking-end", id: String(p.id) };
    case "text_start": {
      const role = p.role === "user" ? "user" : "agent";
      if (role === "user") {
        return { t, kind: "user", text: String(p.text ?? "") };
      }
      return {
        t,
        kind: "agent-text-start",
        id: String(p.id),
        text: String(p.text ?? ""),
      };
    }
    case "text_delta":
      return {
        t,
        kind: "agent-text-append",
        id: String(p.id),
        text: String(p.text ?? ""),
      };
    case "tool_call":
      return {
        t,
        kind: "tool-call",
        id: String(p.id),
        name: String(p.name ?? "unknown"),
        target: String(p.target ?? ""),
        args: String(p.args ?? ""),
        journalKind:
          (p.journalKind as
            | "tool"
            | "fs"
            | "llm"
            | "nous"
            | "autonomic"
            | "haima"
            | undefined) ?? "tool",
      };
    case "tool_result":
      return {
        t,
        kind: "tool-result",
        id: String(p.id),
        result: String(p.result ?? ""),
      };
    case "fs_op":
      return {
        t,
        kind: "fs-op",
        path: String(p.path ?? ""),
        op: (p.op as "read" | "write" | "create" | "delete") ?? "read",
        content: typeof p.content === "string" ? p.content : undefined,
        title: typeof p.title === "string" ? p.title : undefined,
        bytes: typeof p.bytes === "number" ? p.bytes : undefined,
      };
    case "nous_score":
      return {
        t,
        kind: "nous-score",
        score: Number(p.score ?? 0),
        band: (p.band as "good" | "warn") ?? "good",
        note: String(p.note ?? ""),
      };
    case "autonomic_event":
      return {
        t,
        kind: "autonomic-event",
        pillar:
          (p.pillar as "operational" | "cognitive" | "economic") ?? "operational",
        text: String(p.text ?? ""),
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PaymentQuote {
  amount: number;
  currency: "USD";
  railsAccepted: Array<"usdc-base" | "bre-b" | "stripe">;
  nonce: string;
}

export type LiveRunStatus =
  | "idle"
  | "streaming"
  | "succeeded"
  | "failed"
  | "payment-required";

export interface LiveRunMeta {
  status: LiveRunStatus;
  error?: string;
  /** Life session id — stable across turns in the same conversation. */
  sessionId?: string;
  /** Current-turn run id (changes each send). */
  runId?: string;
  /** Inferred model from the server's run_metadata event. */
  model?: string;
  /** Payment mode for the current turn. */
  paymentMode?: string;
  /** Cumulative USD cents spent across all turns of this session. */
  totalCostCents: number;
  /** Last turn's cost in cents (reset on new turn). */
  lastTurnCostCents: number;
  /** Populated when status === "payment-required". */
  paymentQuote?: PaymentQuote;
  projectSlug?: string;
  /** Clear payment-required state (called by the approval modal on cancel). */
  dismiss?: () => void;
  /** Retry the current turn with an approved payment header. */
  retryWithPayment?: (header: string | null) => void;
  /** Send a new message in the current session. Triggers a live turn. */
  sendMessage?: (text: string) => void;
}

export type LiveRunHookResult = [
  ReplayState,
  Dispatch<SetStateAction<ReplayState>>,
  LiveRunMeta,
];

export interface UseLiveRunOptions {
  /** URL slug of the project to run. */
  projectSlug: string;
  /** Master toggle — turn the hook on/off. */
  enabled: boolean;
  /**
   * When true, the first auto-fired run POSTs an empty body (triggers the
   * server-side scenario replay for the landing state). If false, no auto
   * run — the UI must call sendMessage() to start the first turn.
   */
  autoStart?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLiveRun({
  projectSlug,
  enabled,
  autoStart = true,
}: UseLiveRunOptions): LiveRunHookResult {
  const [state, setState] = useState<ReplayState>(EMPTY_REPLAY_STATE);
  const [status, setStatus] = useState<LiveRunStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuote | undefined>(
    undefined,
  );
  const [paymentHeader, setPaymentHeader] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [paymentMode, setPaymentMode] = useState<string | undefined>(undefined);
  const [totalCostCents, setTotalCostCents] = useState(0);
  const [lastTurnCostCents, setLastTurnCostCents] = useState(0);

  // Pending user message — set by sendMessage(). If undefined AND autoStart
  // is true AND we haven't fired yet, we kick off a demo run. If defined,
  // the next effect cycle POSTs that message.
  const [pendingMessage, setPendingMessage] = useState<string | undefined>(
    undefined,
  );
  const [turnCounter, setTurnCounter] = useState(0);
  const hasAutoStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const startTsRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (typeof window === "undefined") return;

    // Decide what to POST this cycle:
    // - pendingMessage present → live turn
    // - autoStart + haven't auto-started yet → demo-start run
    // - otherwise → idle
    const sendingMessage = pendingMessage;
    const isAutoStart =
      !sendingMessage && autoStart && !hasAutoStartedRef.current;
    if (!sendingMessage && !isAutoStart) return;

    const controller = new AbortController();
    abortRef.current = controller;
    // Only reset visual state on a new live turn OR the first autoStart.
    // Subsequent live turns APPEND to the chat — we reset `t` to keep
    // timings coherent without wiping prior messages.
    if (sendingMessage) {
      setState((prev) => ({ ...prev, t: 0 }));
    } else {
      setState(EMPTY_REPLAY_STATE);
    }
    setStatus("streaming");
    setError(undefined);
    setPaymentQuote(undefined);
    setLastTurnCostCents(0);
    startTsRef.current = performance.now();
    if (isAutoStart) hasAutoStartedRef.current = true;
    if (sendingMessage) setPendingMessage(undefined);

    (async () => {
      try {
        const reqHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (paymentHeader) reqHeaders["X-PAYMENT"] = paymentHeader;

        const reqBody: {
          input: null;
          sessionId?: string;
          message?: string;
        } = { input: null };
        if (sessionId) reqBody.sessionId = sessionId;
        if (sendingMessage) reqBody.message = sendingMessage;

        const resp = await fetch(`/api/life/run/${projectSlug}`, {
          method: "POST",
          signal: controller.signal,
          headers: reqHeaders,
          body: JSON.stringify(reqBody),
        });

        if (resp.status === 402) {
          const body = await resp.json().catch(() => ({ quote: undefined }));
          setStatus("payment-required");
          if (body.quote) setPaymentQuote(body.quote as PaymentQuote);
          return;
        }

        if (!resp.ok || !resp.body) {
          const bodyText = await resp.text().catch(() => "");
          setStatus("failed");
          setError(`HTTP ${resp.status}: ${bodyText.slice(0, 200)}`);
          return;
        }

        // If this was a live turn, emit a synthetic user message into the
        // replay state so the Chat column shows what the user just asked.
        if (sendingMessage) {
          const elapsed = performance.now() - startTsRef.current;
          const userEv: ReplayEvent = {
            t: elapsed,
            kind: "user",
            text: sendingMessage,
          };
          setState((prev) => applyReplayEvent({ ...prev, t: elapsed }, userEv));
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n").filter(Boolean);
            const dataLines = lines
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart());
            if (dataLines.length === 0) continue;
            const json = dataLines.join("");
            let ev: ServerEvent;
            try {
              ev = JSON.parse(json) as ServerEvent;
            } catch {
              continue;
            }
            const elapsed = performance.now() - startTsRef.current;

            // Capture metadata that drives inspector panes.
            if (ev.type === "run_metadata") {
              const meta = ev.payload as Record<string, unknown>;
              if (typeof meta.sessionId === "string") {
                setSessionId(meta.sessionId);
              }
              if (typeof meta.runId === "string") {
                setRunId(meta.runId);
              }
              if (typeof meta.paymentMode === "string") {
                setPaymentMode(meta.paymentMode);
              }
            }
            if (ev.type === "done") {
              const p = ev.payload as {
                costCents?: number;
                model?: string;
              };
              if (typeof p.costCents === "number") {
                setLastTurnCostCents(p.costCents);
                setTotalCostCents((c) => c + p.costCents!);
              }
              setStatus("succeeded");
              continue;
            }
            if (ev.type === "error") {
              setStatus("failed");
              setError(String(ev.payload?.message ?? "unknown error"));
              continue;
            }

            const replayEv = toReplayEvent(ev, elapsed);
            if (replayEv) {
              setState((prev) => applyReplayEvent({ ...prev, t: elapsed }, replayEv));
            } else {
              setState((prev) => ({ ...prev, t: elapsed }));
            }
          }
        }

        // If the server closed without a `done` event, mark succeeded anyway.
        setStatus((s) => (s === "streaming" ? "succeeded" : s));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setStatus("failed");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => controller.abort();
    // `sessionId` + `paymentHeader` can change mid-life; rerun when the
    // caller bumps the turn counter explicitly. Changes to `projectSlug`
    // reset the whole conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectSlug, turnCounter]);

  // Reset conversation state when the project changes.
  useEffect(() => {
    setSessionId(undefined);
    setTotalCostCents(0);
    setLastTurnCostCents(0);
    hasAutoStartedRef.current = false;
    setState(EMPTY_REPLAY_STATE);
    setStatus("idle");
  }, [projectSlug]);

  const dismiss = useCallback(() => {
    setPaymentQuote(undefined);
    setStatus("idle");
    setPaymentHeader(null);
  }, []);

  const retryWithPayment = useCallback((header: string | null) => {
    setPaymentHeader(header);
    setPaymentQuote(undefined);
    setStatus("streaming");
    setTurnCounter((k) => k + 1);
  }, []);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPendingMessage(trimmed);
    setTurnCounter((k) => k + 1);
  }, []);

  return [
    state,
    setState,
    {
      status,
      error,
      sessionId,
      runId,
      model: undefined,
      paymentMode,
      totalCostCents,
      lastTurnCostCents,
      paymentQuote,
      projectSlug,
      dismiss,
      retryWithPayment,
      sendMessage,
    },
  ];
}
