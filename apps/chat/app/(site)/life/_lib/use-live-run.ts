// Live-run hook — drives the Life Interface UI from a real SSE stream
// coming out of /api/life/run/[project]. Returns the same [state, setState]
// tuple as useReplay, so LifeShell can swap between mock and live modes
// with zero downstream component change.
//
// Protocol: each SSE message is { type, payload, at }. Mapped back to
// ReplayEvent shape and folded via applyReplayEvent so the reducer logic
// lives in exactly one place.

"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { ReplayEvent, ReplayState } from "./types";
import { EMPTY_REPLAY_STATE, applyReplayEvent } from "./use-replay";

// ---------------------------------------------------------------------------
// Wire-format event emitted by the server (runner-dispatch.ts)
// ---------------------------------------------------------------------------

interface ServerEvent {
  type: string;
  payload: Record<string, unknown>;
  at: string;
}

/**
 * Translate a server RunEvent to the client's ReplayEvent shape so
 * applyReplayEvent can fold it into state. `t` is synthesized from the
 * wall-clock stream time so the UI's timeline label stays monotonic.
 */
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
        journalKind: (p.journalKind as "tool" | "fs" | "llm" | "nous" | "autonomic" | "haima" | undefined) ?? "tool",
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
        pillar: (p.pillar as "operational" | "cognitive" | "economic") ?? "operational",
        text: String(p.text ?? ""),
      };
    // These are control events — they don't fold into state.
    case "run_started":
    case "run_metadata":
    case "done":
    case "error":
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type LiveRunHookResult = [
  ReplayState,
  Dispatch<SetStateAction<ReplayState>>,
  { status: "idle" | "streaming" | "succeeded" | "failed"; error?: string },
];

export interface UseLiveRunOptions {
  /** URL slug of the project to run (matches LifeProject.slug). */
  projectSlug: string;
  /**
   * Turn the live run on/off. On transition to false mid-stream, the hook
   * cancels the reader so no further events apply.
   */
  enabled: boolean;
  /** Optional input payload sent in the POST body. */
  input?: unknown;
}

/**
 * Reads Server-Sent Events from /api/life/run/[project] and folds them into
 * a ReplayState. Drop-in replacement for useReplay in terms of state shape.
 */
export function useLiveRun({
  projectSlug,
  enabled,
  input,
}: UseLiveRunOptions): LiveRunHookResult {
  const [state, setState] = useState<ReplayState>(EMPTY_REPLAY_STATE);
  const [status, setStatus] = useState<"idle" | "streaming" | "succeeded" | "failed">(
    "idle",
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const startTsRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setState(EMPTY_REPLAY_STATE);
    setStatus("streaming");
    setError(undefined);
    startTsRef.current = performance.now();

    (async () => {
      try {
        const resp = await fetch(`/api/life/run/${projectSlug}`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: input ?? null }),
        });
        if (!resp.ok || !resp.body) {
          // 402 Payment Required from the server lands here for paid projects;
          // surface the quote to callers via the error message for now.
          const body = await resp.text().catch(() => "");
          const msg = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
          setStatus("failed");
          setError(msg);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE events are delimited by a blank line.
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
            const replayEv = toReplayEvent(ev, elapsed);
            if (replayEv) {
              setState((prev) => applyReplayEvent({ ...prev, t: elapsed }, replayEv));
            } else if (ev.type === "done") {
              setStatus("succeeded");
            } else if (ev.type === "error") {
              setStatus("failed");
              setError(String(ev.payload?.message ?? "unknown error"));
            } else {
              // Non-folding control events (run_metadata, run_started) still
              // update elapsed time so the timeline moves.
              setState((prev) => ({ ...prev, t: elapsed }));
            }
          }
        }

        if (status === "streaming") setStatus("succeeded");
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setStatus("failed");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => controller.abort();
    // `input` is deliberately excluded — changing inputs mid-stream is not a
    // supported use case for the current UI (single run per project).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectSlug]);

  return [state, setState, { status, error }];
}
