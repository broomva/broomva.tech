"use client";

import type { LiveRunMeta } from "../_lib/use-live-run";
import type { ReplayState, RightMode } from "../_lib/types";
import { AnimaPane, type LifeUserIdentity } from "./AnimaPane";
import { AutonomicPane } from "./AutonomicPane";
import { HaimaPane } from "./HaimaPane";
import { NousPane } from "./NousPane";
import { PreviewPane } from "./PreviewPane";
import { VigilPane } from "./VigilPane";

interface Props {
  mode: RightMode;
  setMode: (mode: RightMode) => void;
  state: ReplayState;
  /** Present when the column is driven by the real /api/life/run SSE. */
  liveMeta?: LiveRunMeta;
  /** Authed / anon identity threaded from the server page (for Anima pane). */
  user?: LifeUserIdentity;
  projectSlug?: string;
}

const TABS: { id: RightMode; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "vigil", label: "Vigil" },
  { id: "nous", label: "Nous" },
  { id: "autonomic", label: "Autonomic" },
  { id: "haima", label: "Haima" },
  { id: "anima", label: "Anima" },
];

export function RightColumn({
  mode,
  setMode,
  state,
  liveMeta,
  user,
  projectSlug,
}: Props) {
  return (
    <div className="col col--right">
      <div className="col__header">
        <div
          className="tabs"
          style={{ flexWrap: "wrap", gap: 0 }}
          role="tablist"
        >
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
            </button>
          ))}
        </div>
      </div>
      <div className="col__body">
        {mode === "preview" && <PreviewPane state={state} />}
        {mode === "vigil" && <VigilPane state={state} liveMeta={liveMeta} />}
        {mode === "nous" && <NousPane state={state} liveMeta={liveMeta} />}
        {mode === "autonomic" && (
          <AutonomicPane state={state} liveMeta={liveMeta} />
        )}
        {mode === "haima" && <HaimaPane liveMeta={liveMeta} />}
        {mode === "anima" && (
          <AnimaPane
            user={user}
            projectSlug={projectSlug}
            liveMeta={liveMeta}
          />
        )}
      </div>
    </div>
  );
}
