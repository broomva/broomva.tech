"use client";

import type { ReplayState, RightMode } from "../_lib/types";
import { AnimaPane } from "./AnimaPane";
import { AutonomicPane } from "./AutonomicPane";
import { HaimaPane } from "./HaimaPane";
import { NousPane } from "./NousPane";
import { PreviewPane } from "./PreviewPane";
import { VigilPane } from "./VigilPane";

interface Props {
  mode: RightMode;
  setMode: (mode: RightMode) => void;
  state: ReplayState;
}

const TABS: { id: RightMode; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "vigil", label: "Vigil" },
  { id: "nous", label: "Nous" },
  { id: "autonomic", label: "Autonomic" },
  { id: "haima", label: "Haima" },
  { id: "anima", label: "Anima" },
];

export function RightColumn({ mode, setMode, state }: Props) {
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
        {mode === "vigil" && <VigilPane state={state} />}
        {mode === "nous" && <NousPane state={state} />}
        {mode === "autonomic" && <AutonomicPane />}
        {mode === "haima" && <HaimaPane />}
        {mode === "anima" && <AnimaPane />}
      </div>
    </div>
  );
}
