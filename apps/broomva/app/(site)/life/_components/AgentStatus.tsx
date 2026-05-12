"use client";

import type { ReplayState } from "../_lib/types";

interface Props {
  running: boolean;
  state: ReplayState;
}

export function AgentStatus({ running, state }: Props) {
  const last = state.messages[state.messages.length - 1];
  let label = "Idle";
  if (running) {
    if (last?.streamingThinking) label = "Arcan · thinking";
    else if ((last?.tools || []).some((t) => t.status === "running"))
      label = "Arcan · executing tool";
    else if (last?.streamingText) label = "Arcan · streaming";
    else label = "Arcan · ticking";
  }
  const tick = (state.t / 1000).toFixed(1);
  return (
    <div className={`agent-status ${running ? "" : "agent-status--idle"}`}>
      <span className="agent-status__pulse" />
      <span>{label}</span>
      <span style={{ marginLeft: "auto", color: "var(--ag-text-muted)" }}>
        tick · {tick}s
      </span>
    </div>
  );
}
