// Replay clock — drives the streaming agent UI from a typed scenario script.
// Client-only (uses requestAnimationFrame + performance.now).
// SSR-safe: all browser globals are guarded.

"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  LifeJournalEntry,
  LifeMessage,
  LifeTool,
  ReplayEvent,
  ReplayState,
} from "./types";

const EMPTY_STATE: ReplayState = {
  messages: [],
  fsOps: [],
  journal: [],
  nous: null,
  autonomic: [],
  t: 0,
};

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  const mm = Math.floor((ms % 1000) / 10).toString().padStart(2, "0");
  return `${m}:${s}.${mm}`;
}

function applyEvent(s: ReplayState, ev: ReplayEvent): ReplayState {
  const nowIso = formatTime(ev.t);
  switch (ev.kind) {
    case "user": {
      const msg: LifeMessage = {
        id: `u-${ev.t}`,
        role: "user",
        text: ev.text,
        complete: true,
        tools: [],
      };
      const journal: LifeJournalEntry = {
        id: `j-${ev.t}-u`,
        ts: nowIso,
        kind: "llm",
        label: "USER",
        actor: "you",
        msg: ev.text,
        payload: ev.text,
      };
      return {
        ...s,
        messages: [...s.messages, msg],
        journal: [...s.journal, journal],
      };
    }
    case "agent-thinking-start": {
      const msg: LifeMessage = {
        id: ev.id,
        role: "agent",
        text: "",
        thinking: "",
        thinkingOpen: true,
        complete: false,
        streamingThinking: true,
        tools: [],
      };
      return { ...s, messages: [...s.messages, msg] };
    }
    case "thinking": {
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === ev.id
            ? { ...m, thinking: ev.text, streamingThinking: false }
            : m,
        ),
      };
    }
    case "agent-thinking-end": {
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === ev.id ? { ...m, streamingThinking: false } : m,
        ),
      };
    }
    case "agent-text-start": {
      const existing = s.messages.find((m) => m.id === ev.id);
      if (existing) {
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.id === ev.id ? { ...m, text: ev.text, streamingText: true } : m,
          ),
        };
      }
      const msg: LifeMessage = {
        id: ev.id,
        role: "agent",
        text: ev.text,
        thinking: "",
        thinkingOpen: false,
        complete: false,
        streamingText: true,
        tools: [],
      };
      return { ...s, messages: [...s.messages, msg] };
    }
    case "agent-text-append": {
      return {
        ...s,
        messages: s.messages.map((m) =>
          m.id === ev.id
            ? { ...m, text: (m.text || "") + ev.text, streamingText: true }
            : m,
        ),
      };
    }
    case "tool-call": {
      const lastAgent = [...s.messages].reverse().find((m) => m.role === "agent");
      const tool: LifeTool = {
        id: ev.id,
        name: ev.name,
        target: ev.target,
        args: ev.args,
        result: null,
        status: "running",
        t: ev.t,
      };
      const messages = s.messages.map((m) =>
        m === lastAgent ? { ...m, tools: [...(m.tools || []), tool] } : m,
      );
      const journal: LifeJournalEntry = {
        id: `j-${ev.id}-c`,
        ts: nowIso,
        kind: ev.journalKind || "tool",
        label: "TOOL",
        actor: ev.name.split(".")[0] ?? ev.name,
        msg: `${ev.name} → ${ev.target}`,
        payload: ev.args,
        linkToolId: ev.id,
      };
      return { ...s, messages, journal: [...s.journal, journal] };
    }
    case "tool-result": {
      const messages = s.messages.map((m) => ({
        ...m,
        tools: (m.tools || []).map((t) =>
          t.id === ev.id ? { ...t, result: ev.result, status: "ok" as const } : t,
        ),
      }));
      const firstLine = ev.result.split("\n")[0] ?? ev.result;
      const journal: LifeJournalEntry = {
        id: `j-${ev.id}-r`,
        ts: nowIso,
        kind: "tool",
        label: "RESULT",
        actor: "praxis",
        msg: firstLine,
        payload: ev.result,
        linkToolId: ev.id,
      };
      return { ...s, messages, journal: [...s.journal, journal] };
    }
    case "fs-op": {
      const fsOp = {
        id: `fs-${ev.t}-${ev.path}`,
        path: ev.path,
        op: ev.op,
        t: ev.t,
      };
      const journal: LifeJournalEntry = {
        id: `j-${ev.t}-fs`,
        ts: nowIso,
        kind: "fs",
        label: ev.op.toUpperCase(),
        actor: "praxis",
        msg: ev.path,
        payload: `op: ${ev.op}\npath: ${ev.path}`,
      };
      return {
        ...s,
        fsOps: [...s.fsOps, fsOp],
        journal: [...s.journal, journal],
      };
    }
    case "nous-score": {
      const journal: LifeJournalEntry = {
        id: `j-${ev.t}-n`,
        ts: nowIso,
        kind: "nous",
        label: "JUDGE",
        actor: "nous",
        msg: `score ${ev.score.toFixed(2)} · ${ev.note}`,
        payload: ev.note,
      };
      return {
        ...s,
        nous: { score: ev.score, band: ev.band, note: ev.note },
        journal: [...s.journal, journal],
      };
    }
    case "autonomic-event": {
      const journal: LifeJournalEntry = {
        id: `j-${ev.t}-a`,
        ts: nowIso,
        kind: "autonomic",
        label: ev.pillar.toUpperCase(),
        actor: "autonomic",
        msg: ev.text,
        payload: ev.text,
      };
      return {
        ...s,
        autonomic: [...s.autonomic, { t: ev.t, pillar: ev.pillar, text: ev.text }],
        journal: [...s.journal, journal],
      };
    }
    default:
      return s;
  }
}

export type ReplayHookResult = [
  ReplayState,
  Dispatch<SetStateAction<ReplayState>>,
];

export function useReplay(
  script: ReplayEvent[],
  playing: boolean,
): ReplayHookResult {
  const [state, setState] = useState<ReplayState>(EMPTY_STATE);
  const timer = useRef<number | null>(null);
  const idxRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const tRef = useRef(0);

  // Reset whenever the underlying scenario script changes.
  useEffect(() => {
    setState(EMPTY_STATE);
    idxRef.current = 0;
    startRef.current = null;
    tRef.current = 0;
  }, [script]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!playing) {
      if (timer.current !== null) {
        cancelAnimationFrame(timer.current);
        timer.current = null;
      }
      return;
    }
    startRef.current = performance.now() - tRef.current;

    const step = (now: number) => {
      const elapsed = now - (startRef.current ?? now);
      tRef.current = elapsed;
      let didUpdate = false;
      setState((s) => {
        let next: ReplayState = { ...s, t: elapsed };
        while (
          idxRef.current < script.length &&
          script[idxRef.current]!.t <= elapsed
        ) {
          const ev = script[idxRef.current++]!;
          next = applyEvent(next, ev);
          didUpdate = true;
        }
        return didUpdate || next.t !== s.t ? next : s;
      });
      if (idxRef.current < script.length) {
        timer.current = requestAnimationFrame(step);
      } else {
        timer.current = null;
      }
    };

    timer.current = requestAnimationFrame(step);
    return () => {
      if (timer.current !== null) {
        cancelAnimationFrame(timer.current);
        timer.current = null;
      }
    };
    // We deliberately depend only on `playing` and `script` — start ref
    // captures resume time so internal state doesn't retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, script]);

  // Keep tRef in sync when state.t changes externally (e.g. reset).
  useEffect(() => {
    tRef.current = state.t;
  }, [state.t]);

  return [state, setState];
}
