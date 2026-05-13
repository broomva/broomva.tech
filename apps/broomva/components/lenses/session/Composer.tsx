"use client";

import { useRef, useState } from "react";
import { ContextPicker } from "./composer-popovers/ContextPicker";
import { FilePicker } from "./composer-popovers/FilePicker";
import { ToolPicker } from "./composer-popovers/ToolPicker";
import { useSceneContext } from "./SceneContext";

interface Props {
  sid: string;
}

type PopoverMode = "file" | "tool" | "context" | null;

/**
 * Composer — textarea + send + popovers for @ (file), / (tool),
 * + context (broader entity picker). Cmd+Enter sends. Popovers are
 * keyboard-driven (arrow keys, Enter, Esc).
 */
export function Composer({ sid }: Props) {
  const { lastSeq } = useSceneContext();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [popover, setPopover] = useState<PopoverMode>(null);
  const [popoverQuery, setPopoverQuery] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  const detectTrigger = (text: string) => {
    if (popover !== null) {
      // Already inside a popover — extract the query from the trigger
      // character to end-of-string.
      const trig = popover === "file" ? "@" : "/";
      const lastIdx = text.lastIndexOf(trig);
      if (lastIdx === -1) {
        setPopover(null);
        setPopoverQuery("");
        return;
      }
      setPopoverQuery(text.slice(lastIdx + 1));
      return;
    }
    // Not yet in a popover — detect if the cursor is at a position where
    // @ or / was just typed. We use a heuristic: the last character is a
    // trigger AND it's at a word boundary (preceded by whitespace or
    // start-of-string).
    const m = text.match(/(?:^|\s)([@/])([\w./-]*)$/);
    if (m) {
      setPopover(m[1] === "@" ? "file" : "tool");
      setPopoverQuery(m[2] ?? "");
    }
  };

  const insertSelection = (token: string) => {
    // Replace the trigger+query at end of draft with the token + trailing space.
    const trig = popover === "file" ? "@" : popover === "tool" ? "/" : "";
    if (trig) {
      setDraft((d) => {
        const lastIdx = d.lastIndexOf(trig);
        if (lastIdx === -1) return `${d}${token}`;
        return `${d.slice(0, lastIdx)}${token} `;
      });
    } else {
      setDraft((d) => `${d}${token}`);
    }
    setPopover(null);
    setPopoverQuery("");
    taRef.current?.focus();
  };

  return (
    <div className="border-t border-white/[0.04] px-7 py-3.5 pb-[18px]">
      <div className="ag-glass-subtle relative flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-2.5">
        <FilePicker
          open={popover === "file"}
          query={popoverQuery}
          onSelect={(path) => insertSelection(`@${path}`)}
          onClose={() => {
            setPopover(null);
            setPopoverQuery("");
          }}
        />
        <ToolPicker
          open={popover === "tool"}
          query={popoverQuery}
          onSelect={(snippet) => insertSelection(snippet)}
          onClose={() => {
            setPopover(null);
            setPopoverQuery("");
          }}
        />
        <ContextPicker
          open={popover === "context"}
          onSelect={(token) => insertSelection(token)}
          onClose={() => setPopover(null)}
        />
        <textarea
          ref={taRef}
          aria-label="Message to the agent"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            detectTrigger(e.target.value);
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              popover === null
            ) {
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPopover((p) => (p === "context" ? null : "context"))
            }
            className="ag-glass-subtle rounded-md px-2 py-1 font-mono text-[10.5px] opacity-70 hover:opacity-100"
          >
            + context
          </button>
          <span className="flex-1" />
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
        <span>↵ newline · ⌘↵ send · @ files · / tools</span>
        <span>seq={lastSeq.toString()}</span>
      </div>
    </div>
  );
}
