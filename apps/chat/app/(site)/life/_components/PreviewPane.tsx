"use client";

import { DEMO_DIFFS } from "../_lib/mock-workspace";
import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
}

export function PreviewPane({ state }: Props) {
  const lastWrite = [...state.fsOps]
    .reverse()
    .find((o) => o.op === "write" || o.op === "create");

  if (!lastWrite) {
    return (
      <div className="right-pane">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Preview
        </div>
        <div
          className="preview-frame"
          style={{ fontStyle: "italic", color: "var(--ag-text-muted)" }}
        >
          No artifact yet. Preview will mount here when Arcan writes or opens
          a file.
        </div>
      </div>
    );
  }

  // Real content path — when the fs_op carries live content (the agent's
  // `note` tool fills this in), render the actual file instead of the
  // static demo diff. This is the path live /life/sentinel runs take.
  if (lastWrite.content !== undefined) {
    const bytes = lastWrite.bytes ?? lastWrite.content.length;
    return (
      <div className="right-pane">
        <div
          className="row"
          style={{ justifyContent: "space-between", marginBottom: 8 }}
        >
          <div className="eyebrow">
            Preview · {lastWrite.op} · live
          </div>
          <div className="pill pill--accent">{bytes} B</div>
        </div>
        <div
          style={{
            fontFamily: "var(--ag-font-mono)",
            fontSize: 11,
            color: "var(--ag-text-secondary)",
            marginBottom: 10,
          }}
        >
          {lastWrite.path}
        </div>
        {lastWrite.title && (
          <div
            style={{
              fontFamily: "var(--ag-font-heading)",
              fontSize: 16,
              color: "var(--ag-text-primary)",
              marginBottom: 10,
              letterSpacing: "-0.01em",
            }}
          >
            {lastWrite.title}
          </div>
        )}
        <div
          className="preview-frame"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}
        >
          {lastWrite.content}
        </div>
      </div>
    );
  }

  // Fallback — scenario replay mode uses the canned diff so Materiales + demo
  // paths still feel alive.
  const diff = DEMO_DIFFS[lastWrite.path] ?? DEMO_DIFFS.__default!;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Preview · {lastWrite.op}</div>
        <div className="pill pill--accent">{diff.stat}</div>
      </div>
      <div
        style={{
          fontFamily: "var(--ag-font-mono)",
          fontSize: 11,
          color: "var(--ag-text-secondary)",
          marginBottom: 10,
        }}
      >
        {lastWrite.path}
      </div>
      <div className="preview-frame">
        {diff.lines.map((l, i) => (
          <div
            key={`${l.n ?? "x"}-${i}`}
            className={`diff-line ${l.kind ? `diff-line--${l.kind}` : ""}`}
          >
            <span className="diff-line__gut">{l.n ?? ""}</span>
            <span>
              {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
              {l.s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
