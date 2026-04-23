"use client";

import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
}

export function Dock({ state }: Props) {
  const events = state.journal.length;
  const tools = (state.journal || []).filter(
    (e) => e.kind === "tool" && e.label === "TOOL",
  ).length;
  const ctx = 68;
  return (
    <div className="dock">
      <div className="dock__group">
        <span className="dock__item">
          <span className="dock__dot" /> <strong>Arcan</strong> :3000
        </span>
        <span className="dock__item">
          <span className="dock__dot" /> <strong>Lago</strong> :8080
        </span>
        <span className="dock__item">
          <span className="dock__dot" /> <strong>Autonomic</strong> :3002
        </span>
        <span className="dock__item">
          <span className="dock__dot" /> <strong>Haima</strong> :3003
        </span>
        <span className="dock__item">
          <span className="dock__dot dock__dot--warn" />{" "}
          <strong>Nous</strong> :3004
        </span>
      </div>
      <div className="dock__group">
        <span className="dock__item">
          events <strong>{events}</strong>
        </span>
        <span className="dock__item">
          tool calls <strong>{tools}</strong>
        </span>
        <span className="dock__item">
          ctx <strong>{ctx}%</strong>
        </span>
        <span className="dock__item">v0.9.2</span>
      </div>
    </div>
  );
}
