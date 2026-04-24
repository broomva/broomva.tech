"use client";

import type { MiddleMode, ReplayState } from "../_lib/types";
import { FileTree } from "./FileTree";
import { Journal } from "./Journal";
import { KnowledgeGraph } from "./KnowledgeGraph";
import { Peers } from "./Peers";
import { Timeline } from "./Timeline";

interface Props {
  mode: MiddleMode;
  setMode: (mode: MiddleMode) => void;
  state: ReplayState;
  toolHighlight: string | null;
  setToolHighlight: (id: string | null) => void;
  lastOpTs: number;
}

const TABS: { id: MiddleMode; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "journal", label: "Journal" },
  { id: "timeline", label: "Timeline" },
  { id: "graph", label: "Graph" },
  { id: "spaces", label: "Spaces" },
];

export function MiddleColumn({
  mode,
  setMode,
  state,
  toolHighlight,
  setToolHighlight,
  lastOpTs,
}: Props) {
  const dotByMode: Record<MiddleMode, boolean> = {
    files: state.fsOps.length > 0,
    journal: state.journal.length > 0,
    timeline: state.journal.length > 0,
    graph: false,
    spaces: false,
  };
  return (
    <div className="col col--middle">
      <div className="col__header">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className="tab"
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => setMode(t.id)}
            >
              {t.label}
              {dotByMode[t.id] && mode !== t.id && <span className="dot" />}
            </button>
          ))}
        </div>
        <div
          className="row"
          style={{
            gap: 8,
            color: "var(--ag-text-muted)",
            fontFamily: "var(--ag-font-mono)",
            fontSize: 10.5,
          }}
        >
          {mode === "files" && <>{state.fsOps.length} ops</>}
          {mode === "journal" && <>{state.journal.length} events</>}
          {mode === "timeline" && <>{state.journal.length} events</>}
        </div>
      </div>
      <div className="col__body">
        {mode === "files" && (
          <FileTree fsOps={state.fsOps} lastOpTs={lastOpTs} />
        )}
        {mode === "journal" && (
          <Journal
            events={state.journal}
            highlight={toolHighlight}
            setHighlight={setToolHighlight}
          />
        )}
        {mode === "timeline" && <Timeline events={state.journal} />}
        {mode === "graph" && <KnowledgeGraph />}
        {mode === "spaces" && <Peers />}
      </div>
    </div>
  );
}
