// Prosopon-native live-run hook. Drop-in replacement for `useLiveRun` —
// same public shape so LifeShell consumes it identically. Internally it:
//
//   1. POSTs to `/api/life/run/<slug>/prosopon` (the envelope endpoint).
//   2. Parses each SSE `data:` frame as `Envelope<ProsoponEvent>`.
//   3. Feeds the envelope through `EnvelopeAdapter`, which yields a
//      zero-or-more ReplayEvent stream + meta-channel updates.
//   4. Folds the replay events through `applyReplayEvent` — the same
//      reducer the local scenario clock uses — so every pane keeps
//      working unchanged.
//
// The net effect: broomva.tech/life/<slug> now speaks Prosopon end-to-end
// on the wire, but the UI reducer / panes are untouched. Rewriting the
// panes as Scene selectors is deferred to PR C.2 + the Intent::FileWrite
// RFC. This PR is strictly about the wire swap.
//
// Why an adapter instead of rewriting panes immediately?
//   - Ships the wire migration today without touching 15 pane components.
//   - Lets us decommission the legacy /api/life/run/<slug> endpoint in
//     the follow-up PR D with high confidence (fewer moving parts).
//   - Provides a natural home for future wire-format evolution — when
//     Intent::FileWrite lands as a first-class IR node, the adapter
//     grows one more branch, not the panes.

"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Envelope } from "@broomva/prosopon";
import type { ReplayEvent, ReplayState } from "./types";
import { EMPTY_REPLAY_STATE, applyReplayEvent } from "./use-replay";
import { EnvelopeAdapter, type AdapterMetaEvent } from "./envelope-adapter";

// ---------------------------------------------------------------------------
// Public surface — identical to `useLiveRun` so the hook is a drop-in.
// ---------------------------------------------------------------------------

export interface PaymentQuote {
  amount: number;
  currency: "USD";
  railsAccepted: Array<"usdc-base" | "bre-b" | "stripe">;
  nonce: string;
}

export type ProsoponRunStatus =
  | "idle"
  | "streaming"
  | "succeeded"
  | "failed"
  | "payment-required";

export interface ProsoponRunMeta {
  status: ProsoponRunStatus;
  error?: string;
  sessionId?: string;
  runId?: string;
  model?: string;
  paymentMode?: string;
  totalCostCents: number;
  lastTurnCostCents: number;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  paymentQuote?: PaymentQuote;
  projectSlug?: string;
  dismiss?: () => void;
  retryWithPayment?: (header: string | null) => void;
  sendMessage?: (text: string) => void;
}

export type ProsoponRunHookResult = [
  ReplayState,
  Dispatch<SetStateAction<ReplayState>>,
  ProsoponRunMeta,
];

export interface UseProsoponRunOptions {
  /** URL slug of the project to run. */
  projectSlug: string;
  /** Master toggle — turn the hook on/off. */
  enabled: boolean;
  /**
   * True ⇒ automatically POST a first envelope stream on mount (demo mode).
   * The Prosopon endpoint rejects auto-start today (requires a `message`)
   * so this is only honoured when there's a valid user message pending.
   */
  autoStart?: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProsoponRun({
  projectSlug,
  enabled,
  autoStart = false,
}: UseProsoponRunOptions): ProsoponRunHookResult {
  const [state, setState] = useState<ReplayState>(EMPTY_REPLAY_STATE);
  const [status, setStatus] = useState<ProsoponRunStatus>("idle");
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
  const [tokensIn, setTokensIn] = useState<number | undefined>(undefined);
  const [tokensOut, setTokensOut] = useState<number | undefined>(undefined);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);

  const [pendingMessage, setPendingMessage] = useState<string | undefined>(
    undefined,
  );
  const [turnCounter, setTurnCounter] = useState(0);
  const hasAutoStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const startTsRef = useRef<number>(0);

  // New EnvelopeAdapter per turn — it's stateful (nous buffer, autonomic
  // diff tracking), and we want each turn to be a fresh scene reset.
  const adapterRef = useRef<EnvelopeAdapter>(new EnvelopeAdapter());

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (typeof window === "undefined") return;

    const sendingMessage = pendingMessage;
    const isAutoStart =
      !sendingMessage && autoStart && !hasAutoStartedRef.current;
    // Prosopon endpoint requires a user message — no auto-start without one.
    if (!sendingMessage && !isAutoStart) return;
    if (isAutoStart && !sendingMessage) return;

    const controller = new AbortController();
    abortRef.current = controller;
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
    adapterRef.current = new EnvelopeAdapter();

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

        const resp = await fetch(
          `/api/life/run/${projectSlug}/prosopon`,
          {
            method: "POST",
            signal: controller.signal,
            headers: reqHeaders,
            body: JSON.stringify(reqBody),
          },
        );

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

        // Inject the synthetic user message — server-side Prosopon stream
        // never emits one because it's already known from the request body.
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
            const envelope = parseSseFrame(frame);
            if (!envelope) continue;
            const elapsed = performance.now() - startTsRef.current;
            handleEnvelope(envelope, elapsed);
          }
        }

        // Trailing buffer — flush any final frame.
        if (buf.trim().length) {
          const envelope = parseSseFrame(buf);
          if (envelope) {
            const elapsed = performance.now() - startTsRef.current;
            handleEnvelope(envelope, elapsed);
          }
        }

        setStatus((s) => (s === "streaming" ? "succeeded" : s));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setStatus("failed");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    /**
     * Drain one envelope into hook state. Keeps the async reader loop
     * small — any state wiring lives here for readability.
     */
    function handleEnvelope(envelope: Envelope, tMs: number): void {
      // Persist session/run ids off the envelope itself.
      if (envelope.session_id && envelope.session_id !== sessionId) {
        setSessionId(envelope.session_id);
      }

      const out = adapterRef.current.feed(envelope, tMs);
      if (out.reset) {
        // scene_reset collapses to "start from empty state". The hook
        // already zeroed state before the POST, so nothing to do beyond
        // advancing the clock.
        setState((prev) => ({ ...prev, t: tMs }));
      }
      if (out.replay.length) {
        setState((prev) => {
          let next = { ...prev, t: tMs };
          for (const ev of out.replay) {
            next = applyReplayEvent(next, ev);
          }
          return next;
        });
      }
      for (const m of out.meta) applyMeta(m);
    }

    /** Fold a meta-channel update into the appropriate hook slot. */
    function applyMeta(m: AdapterMetaEvent): void {
      switch (m.kind) {
        case "cost-total":
          setTotalCostCents(Number(m.value));
          break;
        case "cost-turn":
          setLastTurnCostCents(Number(m.value));
          break;
        case "tokens-in":
          setTokensIn(Number(m.value));
          break;
        case "tokens-out":
          setTokensOut(Number(m.value));
          break;
        case "duration-ms":
          setDurationMs(Number(m.value));
          break;
        case "payment-mode":
          setPaymentMode(String(m.value));
          break;
      }
    }

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectSlug, turnCounter]);

  // Reset conversation-wide state when the project changes.
  useEffect(() => {
    setSessionId(undefined);
    setRunId(undefined);
    setTotalCostCents(0);
    setLastTurnCostCents(0);
    setTokensIn(undefined);
    setTokensOut(undefined);
    setDurationMs(undefined);
    hasAutoStartedRef.current = false;
    setState(EMPTY_REPLAY_STATE);
    setStatus("idle");
    adapterRef.current = new EnvelopeAdapter();
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
      tokensIn,
      tokensOut,
      durationMs,
      paymentQuote,
      projectSlug,
      dismiss,
      retryWithPayment,
      sendMessage,
    },
  ];
}

// ---------------------------------------------------------------------------
// SSE framing
// ---------------------------------------------------------------------------

/**
 * Parse one SSE frame (the block separated by a blank line). Returns the
 * decoded Prosopon envelope or `null` when the frame is a comment, a
 * heartbeat without payload, or unparseable.
 */
function parseSseFrame(frame: string): Envelope | null {
  const lines = frame.split("\n").filter(Boolean);
  const dataLines = lines
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  const json = dataLines.join("");
  try {
    return JSON.parse(json) as Envelope;
  } catch {
    return null;
  }
}
