"use client";

import type { SceneNode } from "@broomva/prosopon";
import { useState } from "react";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface ChoiceShape {
  prompt?: string;
  options?: string[];
  dispatch_id?: string;
}

/**
 * choice — agent requests user to pick one of N options. Selection POSTs
 * to /api/life-proxy/agent/approve-dispatch with the chosen value as
 * `selected_choice`.
 */
export function ChoiceIntent({ node, sid }: Props) {
  const intent = node.intent as unknown as ChoiceShape;
  const options = intent.options ?? [];
  const [pending, setPending] = useState<string | null>(null);

  const choose = async (option: string) => {
    if (!sid || !intent.dispatch_id) return;
    setPending(option);
    try {
      await fetch("/api/life-proxy/agent/approve-dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sid,
          dispatchId: intent.dispatch_id,
          selected_choice: option,
        }),
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mb-[22px] rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-3">
      {intent.prompt && (
        <div className="mb-2 text-[13px] opacity-90">{intent.prompt}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => choose(opt)}
            disabled={pending !== null}
            className="rounded-md border border-white/15 bg-[color:var(--ag-bg-elevated)] px-3 py-1.5 text-[12px] hover:bg-[color:var(--ag-bg-hover)] disabled:opacity-50"
          >
            {pending === opt ? "…" : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
