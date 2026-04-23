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
