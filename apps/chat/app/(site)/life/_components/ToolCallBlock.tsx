"use client";

import type { LifeTool } from "../_lib/types";

interface Props {
  tool: LifeTool;
  highlighted: boolean;
  onClick: () => void;
  open: boolean;
  onToggle: () => void;
}

function toolIcon(name: string): string {
  if (name.startsWith("praxis.read")) return "R";
  if (name.startsWith("praxis.edit")) return "E";
  if (name.startsWith("praxis.shell")) return "$";
  if (name.startsWith("vigil")) return "V";
  if (name.startsWith("lago")) return "L";
  if (name.startsWith("haima")) return "¤";
  if (name.startsWith("spaces")) return "S";
  if (name.startsWith("nous")) return "N";
  return "•";
}

export function ToolCallBlock({
  tool,
  highlighted,
  onClick,
  open,
  onToggle,
}: Props) {
  const iconChar = toolIcon(tool.name);
  return (
    <div
      className={`toolcall ${highlighted ? "is-highlighted" : ""}`}
      data-open={open ? "true" : "false"}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className="toolcall__head"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="toolcall__icon">{iconChar}</div>
        <div className="toolcall__name">{tool.name}</div>
        <div className="toolcall__target">{tool.target}</div>
        <div className="toolcall__meta">
          {tool.status === "running" ? (
            <>
              <span className="caret" style={{ height: 9, width: 4 }} /> running
            </>
          ) : (
            <>
              <span
                className="dock__dot"
                style={{ background: "oklch(0.72 0.19 155)" }}
              />{" "}
              ok
            </>
          )}
          <span>▾</span>
        </div>
      </div>
      <div className="toolcall__body">
        <div style={{ color: "var(--ag-text-muted)", marginBottom: 6 }}>args:</div>
        <div style={{ color: "var(--ag-text-secondary)" }}>{tool.args}</div>
        {tool.result && (
          <>
            <div style={{ color: "var(--ag-text-muted)", margin: "10px 0 6px" }}>
              result:
            </div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                color: "var(--ag-text-primary)",
              }}
            >
              {tool.result}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
