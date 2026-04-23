"use client";

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
        <div className="pane-empty">
          <div className="pane-empty__title">No artifact yet</div>
          <div className="pane-empty__body">
            When the agent writes or opens a file, its contents render here.
            Ask it to write a note, draft a checklist, or open a document to
            see the preview live.
          </div>
        </div>
      </div>
    );
  }

  const bytes =
    lastWrite.bytes ?? (lastWrite.content?.length ?? 0);

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Preview · {lastWrite.op} · live</div>
        <div className="pill pill--accent">{bytes} B</div>
      </div>
      <div
        style={{
          fontFamily: "var(--ag-font-mono)",
          fontSize: 11,
          color: "var(--ag-text-secondary)",
          marginBottom: 10,
          wordBreak: "break-all",
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
      {lastWrite.content ? (
        <div
          className="preview-frame"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}
        >
          {lastWrite.content}
        </div>
      ) : (
        <div className="pane-empty pane-empty--inline">
          <div className="pane-empty__body">
            Path was touched but no content was emitted. Prosopon{" "}
            <code>Intent::FileWrite</code> will carry the body once landed.
          </div>
        </div>
      )}
    </div>
  );
}
