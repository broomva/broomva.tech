"use client";

import { useState } from "react";
import type { LifeMessage } from "../_lib/types";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

interface Props {
  message: LifeMessage;
  toolHighlight: string | null;
  setToolHighlight: (id: string | null) => void;
  onToggleThinking: (id: string) => void;
  running: boolean;
}

// TODO: replace renderMarkdownLite with `streamdown` (already a dep) for
// production-grade streaming markdown. Until then this is a tiny inline
// renderer for the mock-replay scenarios that ship trusted strings only.
function renderMarkdownLite(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts: { kind: "p" | "pre"; s: string }[] = [];
  const fence = /```([\s\S]*?)```/g;
  let i = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex loop
  while ((m = fence.exec(text))) {
    if (m.index > i) parts.push({ kind: "p", s: text.slice(i, m.index) });
    parts.push({ kind: "pre", s: m[1] ?? "" });
    i = fence.lastIndex;
  }
  if (i < text.length) parts.push({ kind: "p", s: text.slice(i) });

  return parts.map((part, idx) => {
    if (part.kind === "pre") {
      return <pre key={`pre-${idx}-${part.s.length}`}>{part.s}</pre>;
    }
    const html = part.s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>");
    return (
      <span
        key={`p-${idx}-${part.s.length}`}
        // Mock-replay strings only — no untrusted user input reaches here.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted mock
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

export function ChatMessage({
  message,
  toolHighlight,
  setToolHighlight,
  onToggleThinking,
  running,
}: Props) {
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});

  return (
    <div className={`msg msg--${message.role}`}>
      <div className="msg__role">
        <span className="swatch" />
        {message.role === "user" ? "YOU" : "ARCAN"}
      </div>
      <div className="msg__body">
        {message.thinking && (
          <ThinkingBlock
            text={message.thinking}
            open={message.thinkingOpen ?? false}
            streaming={message.streamingThinking}
            onToggle={() => onToggleThinking(message.id)}
          />
        )}
        {(message.tools || []).map((tool) => (
          <ToolCallBlock
            key={tool.id}
            tool={tool}
            highlighted={toolHighlight === tool.id}
            onClick={() => setToolHighlight(tool.id)}
            open={!!openTools[tool.id]}
            onToggle={() =>
              setOpenTools((o) => ({ ...o, [tool.id]: !o[tool.id] }))
            }
          />
        ))}
        <div>
          {renderMarkdownLite(message.text)}
          {message.streamingText && running && <span className="caret" />}
        </div>
      </div>
    </div>
  );
}
