"use client";

import { applyEvent, type ProsoponEvent, type Scene } from "@broomva/prosopon";
import { useEffect, useReducer, useRef, useState } from "react";

const EMPTY_SCENE: Scene = {
  id: "",
  root: {
    id: "root",
    intent: { type: "prose", text: "" },
  },
  signals: {},
};

interface State {
  scene: Scene;
  lastSeq: bigint;
}

type Action = { kind: "event"; event: ProsoponEvent } | { kind: "reset" };

function reducer(state: State, action: Action): State {
  if (action.kind === "reset") {
    return { scene: EMPTY_SCENE, lastSeq: 0n };
  }
  // Prosopon's applyEvent is pure and idempotent for older events; safe to call.
  const nextScene = applyEvent(state.scene, action.event);
  const seq =
    typeof (action.event as any).seq === "bigint"
      ? (action.event as any).seq
      : typeof (action.event as any).seq === "string"
        ? BigInt((action.event as any).seq)
        : state.lastSeq;
  const nextSeq = seq > state.lastSeq ? seq : state.lastSeq;
  return { scene: nextScene, lastSeq: nextSeq };
}

export interface UseSessionStreamOptions {
  sid: string;
  /** Initial sequence cursor; default 0n. Read from URL hash by caller. */
  initialSeq?: bigint;
}

export interface UseSessionStreamResult {
  scene: Scene;
  lastSeq: bigint;
  connected: boolean;
  dispatch: (event: ProsoponEvent) => void;
}

/**
 * Opens an SSE connection to /api/life-proxy/sse/[sid] and reduces incoming
 * Prosopon envelopes into a Scene via applyEvent. Mirrors lastSeq to the
 * URL hash so reload picks up the cursor.
 */
export function useSessionStream(
  opts: UseSessionStreamOptions,
): UseSessionStreamResult {
  const { sid, initialSeq = 0n } = opts;
  const [state, dispatchAction] = useReducer(reducer, {
    scene: EMPTY_SCENE,
    lastSeq: initialSeq,
  });
  const [connected, setConnected] = useState(false);
  const seqRef = useRef(initialSeq);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `/api/life-proxy/sse/${encodeURIComponent(sid)}?from_seq=${seqRef.current.toString()}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as ProsoponEvent;
        dispatchAction({ kind: "event", event: parsed });
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      es.close();
    };
  }, [sid]);

  // Mirror lastSeq → URL hash whenever it advances. replaceState avoids
  // polluting history.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.lastSeq <= 0n) return;
    seqRef.current = state.lastSeq;
    const newHash = `#seq=${state.lastSeq.toString()}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${newHash}`,
      );
    }
  }, [state.lastSeq]);

  return {
    scene: state.scene,
    lastSeq: state.lastSeq,
    connected,
    dispatch: (event) => dispatchAction({ kind: "event", event }),
  };
}
