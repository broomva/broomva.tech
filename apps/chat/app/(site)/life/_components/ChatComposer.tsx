"use client";

import { useRef, useState } from "react";

interface Props {
  /**
   * When present, the Composer is a live send button — hitting Enter
   * (or clicking Send) dispatches the message through the parent's
   * `sendMessage`. When absent, the Composer is inert (read-only demo).
   */
  onSend?: (text: string) => void;
  /** Model identifier shown in the footer. Defaults to "life-runtime". */
  modelLabel?: string;
}

export function ChatComposer({ onSend, modelLabel }: Props) {
  const [v, setV] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = Boolean(onSend) && v.trim().length > 0 && !sending;

  const submit = () => {
    if (!onSend || !v.trim() || sending) return;
    setSending(true);
    onSend(v.trim());
    setV("");
    // Give the hook a tick to register the new turn, then re-enable.
    setTimeout(() => setSending(false), 400);
    textareaRef.current?.focus();
  };

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer__input"
        placeholder={
          onSend
            ? "Ask Arcan anything. Shift+Enter for newline."
            : "Chat is in demo-replay mode — the composer is inert on this project."
        }
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSend) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={!onSend}
      />
      <div className="composer__footer">
        <div className="row" style={{ gap: 10 }}>
          <span>{modelLabel ?? "life-runtime"}</span>
          <span>·</span>
          <span>praxis · 1 tool</span>
          <span>·</span>
          <span>{onSend ? "live" : "demo"}</span>
        </div>
        <div className="composer__actions">
          <button type="button" className="btn btn--ghost" disabled>
            @attach
          </button>
          <button type="button" className="btn btn--ghost" disabled>
            /slash
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={!canSend}
          >
            {sending ? "…" : "Send ⏎"}
          </button>
        </div>
      </div>
    </div>
  );
}
