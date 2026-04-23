"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ReplayState, TweaksState } from "../_lib/types";
import { ChatColumn } from "./ChatColumn";
import { Constellation } from "./Constellation";
import { MiddleColumn } from "./MiddleColumn";
import { RightColumn } from "./RightColumn";

interface Props {
  state: ReplayState;
  setState: Dispatch<SetStateAction<ReplayState>>;
  running: boolean;
  tweaks: TweaksState;
  setTweaks: (patch: Partial<TweaksState>) => void;
  toolHighlight: string | null;
  setToolHighlight: (id: string | null) => void;
  lastOpTs: number;
}

export function ExperimentalCanvas({
  state,
  setState,
  running,
  tweaks,
  setTweaks,
  toolHighlight,
  setToolHighlight,
  lastOpTs,
}: Props) {
  return (
    <div className="col col--experimental" style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 14,
          padding: 14,
        }}
      >
        <div
          className="ag-glass"
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 16,
          }}
        >
          <ChatColumn
            state={state}
            setState={setState}
            running={running}
            setToolHighlight={setToolHighlight}
            toolHighlight={toolHighlight}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateRows: "1fr 1fr",
            gap: 14,
          }}
        >
          <div
            className="ag-glass"
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 14,
                zIndex: 2,
              }}
            >
              <span className="eyebrow">Filesystem · live constellation</span>
            </div>
            <Constellation state={state} lastOpTs={lastOpTs} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div
              className="ag-glass"
              style={{
                overflow: "hidden",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--ag-border-subtle)",
                }}
              >
                <span className="eyebrow">Journal · stream</span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <MiddleColumn
                  mode="journal"
                  setMode={() => {}}
                  state={state}
                  toolHighlight={toolHighlight}
                  setToolHighlight={setToolHighlight}
                  fsStyle="heartbeat"
                  journalRich={false}
                  lastOpTs={lastOpTs}
                />
              </div>
            </div>
            <div
              className="ag-glass"
              style={{
                overflow: "hidden",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--ag-border-subtle)",
                }}
              >
                <span className="eyebrow">Inspector · {tweaks.rightMode}</span>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <RightColumn
                  mode={tweaks.rightMode}
                  setMode={(m) => setTweaks({ rightMode: m })}
                  state={state}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
