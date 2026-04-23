"use client";

import { useState } from "react";

export function ChatComposer() {
  const [v, setV] = useState("");
  return (
    <div className="composer">
      <textarea
        className="composer__input"
        placeholder="Ask Arcan anything. Shift+Enter for newline."
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <div className="composer__footer">
        <div className="row" style={{ gap: 10 }}>
          <span>claude-haiku-4-5</span>
          <span>·</span>
          <span>praxis · 14 tools</span>
          <span>·</span>
          <span>ctx 68%</span>
        </div>
        <div className="composer__actions">
          <button type="button" className="btn btn--ghost">
            @attach
          </button>
          <button type="button" className="btn btn--ghost">
            /slash
          </button>
          <button type="button" className="btn btn--primary">
            Send ⏎
          </button>
        </div>
      </div>
    </div>
  );
}
