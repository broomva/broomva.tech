"use client";

interface Props {
  text: string;
  open: boolean;
  streaming?: boolean;
  onToggle: () => void;
}

export function ThinkingBlock({ text, open, streaming, onToggle }: Props) {
  return (
    <div className="thinking" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="thinking__head"
        onClick={onToggle}
        style={{
          width: "100%",
          appearance: "none",
          border: 0,
          background: "transparent",
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span className="eyebrow">{streaming ? "Thinking…" : "Thought"}</span>
        <span className="row" style={{ gap: 10 }}>
          {streaming && <span className="caret" style={{ height: 10, width: 5 }} />}
          <span className="chev">▾</span>
        </span>
      </button>
      <div className="thinking__body">{text || "…"}</div>
    </div>
  );
}
