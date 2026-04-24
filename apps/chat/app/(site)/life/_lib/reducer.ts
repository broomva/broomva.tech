// Live-state reducer for /life panes.
//
// Each `ReplayEvent` folds into the `ReplayState` the panes render. On the
// live wire, events come from the `EnvelopeAdapter` which translates Prosopon
// envelopes. The reducer itself is pure — given the same events in the same
// order, the same state is produced. SSR / Node / browser all run it
// identically.
//
// (Previously lived in `use-replay.ts` alongside a scenario-replay clock.
// The clock was removed along with the rest of the prototype demo surface;
// this file preserves the reducer so Prosopon-driven state folding still
// works.)

import type {
  LifeFsOp,
  LifeJournalEntry,
  LifeMessage,
  LifeTool,
  ReplayEvent,
  ReplayState,
} from "./types";

export const EMPTY_REPLAY_STATE: ReplayState = {
  messages: [],
  fsOps: [],
  journal: [],
  nous: null,
  autonomic: [],
  t: 0,
};

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  const mm = Math.floor((ms % 1000) / 10)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}.${mm}`;
}

export function applyReplayEvent(s: ReplayState, ev: ReplayEvent): ReplayState {
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
      const lastAgent = [...s.messages]
        .reverse()
        .find((m) => m.role === "agent");
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
          t.id === ev.id
            ? { ...t, result: ev.result, status: "ok" as const, endT: ev.t }
            : t,
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
      const fsOp: LifeFsOp = {
        id: `fs-${ev.t}-${ev.path}`,
        path: ev.path,
        op: ev.op,
        t: ev.t,
        content: ev.content,
        title: ev.title,
        bytes: ev.bytes,
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
        autonomic: [
          ...s.autonomic,
          { t: ev.t, pillar: ev.pillar, text: ev.text },
        ],
        journal: [...s.journal, journal],
      };
    }
    default:
      return s;
  }
}
