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
  /** Send handler — routes to /api/life/run/<slug>/prosopon. */
  onSendMessage?: (text: string) => void;
  /** Model identifier to display in the Composer footer. */
  modelLabel?: string;
  /** Hint lines for the empty state — swapped per project. */
  emptyStateTitle?: string;
  emptyStateHint?: string;
  /** Suggested first-turn prompts shown below the empty-state title. */
  suggestions?: Array<{ label: string; prompt: string }>;
}

export function ChatColumn({
  state,
  setState,
  running,
  toolHighlight,
  setToolHighlight,
  onSendMessage,
  modelLabel,
  emptyStateTitle,
  emptyStateHint,
  suggestions,
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
          <span className="pill pill--accent">live</span>
        </div>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {state.messages.length === 0 && (
          <div
            style={{
              padding: "60px 20px",
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
                fontSize: 20,
                color: "var(--ag-text-primary)",
                letterSpacing: "-0.01em",
                marginBottom: 10,
              }}
            >
              {emptyStateTitle ?? "What are we making today?"}
            </div>
            <div style={{ marginBottom: 18 }}>
              {emptyStateHint ??
                "Arcan is wired to your workspace — filesystem, Lago journal, Nous, Autonomic, Haima."}
            </div>
            {suggestions && suggestions.length > 0 && onSendMessage && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxWidth: 320,
                  margin: "0 auto",
                  textAlign: "left",
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.prompt}
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onSendMessage(s.prompt)}
                    style={{
                      justifyContent: "flex-start",
                      fontSize: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--ag-border-subtle)",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
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
