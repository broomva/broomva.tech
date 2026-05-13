"use client";

import { useState } from "react";
import { useSceneContext } from "./SceneContext";

interface Props {
  sid: string;
}

/**
 * B-4a composer — plain textarea + send button + Cmd+Enter shortcut.
 *
 * No `@file` / `/tool` / `+ context` popovers in B-4a — those land in
 * B-4b along with the right rail. The hint footer documents the
 * keyboard contract so users discover the shortcut without surfacing
 * affordances that don't yet work.
 *
 * POSTs to `/api/life-proxy/agent/send-message` with `{ sid, content }`.
 * The proxy is responsible for auth + forwarding to the upstream
 * runtime; this component never talks to the runtime directly.
 */
export function Composer({ sid }: Props) {
  const { lastSeq } = useSceneContext();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/life-proxy/agent/send-message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sid, content }),
      });
      if (res.ok) setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-white/[0.04] px-7 py-3.5 pb-[18px]">
      <div className="ag-glass-subtle flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-2.5">
        <textarea
          aria-label="Message to the agent"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Speak to the agent. Streams arrive as Prosopon intents."
          rows={1}
          style={{
            background: "transparent",
            color: "rgba(255,255,255,.95)",
            fontFamily: "Inter, -apple-system, sans-serif",
            fontSize: 14,
            lineHeight: 1.65,
            resize: "none",
            outline: "none",
            width: "100%",
            minHeight: 36,
            maxHeight: 240,
          }}
        />
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-[color:var(--ag-bg-deep)] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--ag-ai-blue), var(--ag-accent-blue, var(--ag-ai-blue)))",
            }}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex justify-between px-1 font-mono text-[10px] opacity-50">
        <span>↵ newline · ⌘↵ send</span>
        <span>seq={lastSeq.toString()}</span>
      </div>
    </div>
  );
}
