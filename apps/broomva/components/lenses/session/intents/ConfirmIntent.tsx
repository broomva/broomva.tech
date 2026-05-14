"use client";

import type { SceneNode } from "@broomva/prosopon";
import { useState } from "react";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface ConfirmShape {
  prompt?: string;
  dispatch_id?: string;
  confirm_label?: string;
  cancel_label?: string;
}

export function ConfirmIntent({ node, sid }: Props) {
  const intent = node.intent as unknown as ConfirmShape;
  const [pending, setPending] = useState<"confirm" | "cancel" | null>(null);

  const post = async (kind: "confirm" | "cancel") => {
    if (!sid || !intent.dispatch_id) return;
    setPending(kind);
    try {
      const path = kind === "confirm" ? "approve-dispatch" : "cancel-dispatch";
      await fetch(`/api/life-proxy/agent/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sid,
          dispatchId: intent.dispatch_id,
          ...(kind === "cancel" ? { reason: "user_cancelled" } : {}),
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => post("confirm")}
          disabled={pending !== null}
          className="rounded-md bg-[color:var(--ag-ai-blue)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ag-bg-deep)] disabled:opacity-50"
        >
          {pending === "confirm" ? "…" : (intent.confirm_label ?? "Confirm")}
        </button>
        <button
          type="button"
          onClick={() => post("cancel")}
          disabled={pending !== null}
          className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] hover:bg-[color:var(--ag-bg-hover)] disabled:opacity-50"
        >
          {pending === "cancel" ? "…" : (intent.cancel_label ?? "Cancel")}
        </button>
      </div>
    </div>
  );
}
