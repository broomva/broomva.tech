"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import type { ReplayState } from "../_lib/types";
import { AgentStatus } from "./AgentStatus";
import { ChatComposer } from "./ChatComposer";
import { ChatMessage } from "./ChatMessage";

interface Props {
  state: ReplayState;
  setState: Dispatch<SetStateAction<ReplayState>>;
  running: boolean;
  toolHighlight: string | null;
  setToolHighlight: (id: string | null) => void;
  /** When present, Composer is a real send button that routes to /api/life/run. */
  onSendMessage?: (text: string) => void;
  /** Label for the "mock | live" chip in the column header. */
  sourceLabel?: "mock" | "live";
  /** Model identifier to display in the Composer footer. */
  modelLabel?: string;
}

export function ChatColumn({
  state,
  setState,
  running,
  toolHighlight,
  setToolHighlight,
  onSendMessage,
  sourceLabel = "mock",
  modelLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on any text/tool change.
  // Build a cheap dependency string so we re-run on token-level updates too.
  const scrollDep = state.messages
    .map(
      (m) =>
        (m.text || "").length +
        (m.thinking || "").length +
        (m.tools || []).length,
    )
    .join(",");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollDep]);

  const toggleThinking = (id: string) => {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, thinkingOpen: !m.thinkingOpen } : m,
      ),
    }));
  };

  return (
    <div className="col col--chat">
      <div className="col__header">
        <div className="row" style={{ gap: 10 }}>
          <span className="eyebrow">Chat · Arcan</span>
          <span
            className={`pill ${sourceLabel === "live" ? "pill--accent" : ""}`}
          >
            {sourceLabel}
          </span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            title="New session"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            title="Sessions"
          >
            ☰
          </button>
        </div>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {state.messages.length === 0 && (
          <div
            style={{
              padding: "80px 12px",
              textAlign: "center",
              color: "var(--ag-text-muted)",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Session
            </div>
            <div
              style={{
                fontFamily: "var(--ag-font-heading)",
                fontSize: 18,
                color: "var(--ag-text-primary)",
                letterSpacing: "-0.01em",
                marginBottom: 10,
              }}
            >
              What are we making today?
            </div>
            <div>
              Arcan is wired to your workspace — filesystem, Lago journal, Nous,
              Autonomic, Haima.
            </div>
          </div>
        )}
        {state.messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            toolHighlight={toolHighlight}
            setToolHighlight={setToolHighlight}
            onToggleThinking={toggleThinking}
            running={running}
          />
        ))}
      </div>
      <AgentStatus running={running} state={state} />
      <ChatComposer onSend={onSendMessage} modelLabel={modelLabel} />
    </div>
  );
}
