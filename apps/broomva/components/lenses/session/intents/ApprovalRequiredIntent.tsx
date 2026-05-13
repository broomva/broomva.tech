"use client";

import type { SceneNode } from "@broomva/prosopon";
import { useState } from "react";

interface Props {
  node: SceneNode;
  sid: string;
}

/**
 * Approval-required intent — inline card with Approve / Deny buttons.
 * POSTs to the two life-proxy endpoints:
 *
 *   POST /api/life-proxy/agent/approve-dispatch  { sid, dispatchId }
 *   POST /api/life-proxy/agent/cancel-dispatch   { sid, dispatchId, reason }
 *
 * Approval is not part of the canonical Prosopon Intent enum (yet); the
 * agent emits this as a custom intent variant carrying `dispatch_id` and
 * a human-readable `summary`. `sid` is required (the dispatcher always
 * passes it). The cast in IntentRenderer's INTENT_MAP isolates the
 * narrowing.
 */
export function ApprovalRequiredIntent({ node, sid }: Props) {
  // approval_required is not (yet) a variant of the canonical Prosopon
  // Intent enum, so cast through unknown to land on the plan-shaped
  // extension intent.
  const intent = node.intent as unknown as {
    kind?: "approval_required";
    type?: "approval_required";
    dispatch_id: string;
    summary?: string;
  };
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);

  const post = async (
    path: "approve-dispatch" | "cancel-dispatch",
    extra: Record<string, unknown>,
  ) => {
    setPending(path === "approve-dispatch" ? "approve" : "deny");
    try {
      await fetch(`/api/life-proxy/agent/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sid,
          dispatchId: intent.dispatch_id,
          ...extra,
        }),
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mb-[22px] rounded-[10px] border border-[color:var(--ag-warning)]/30 bg-gradient-to-b from-[color:var(--ag-warning)]/10 to-[color:var(--ag-warning)]/[0.02] px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--ag-warning)]">
          approval required
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] opacity-50">
          dispatch_id · {intent.dispatch_id}
        </span>
      </div>
      <div className="mb-2.5 text-[13.5px] leading-[1.65] opacity-90">
        {intent.summary ??
          "The agent requested an action that requires your approval."}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => post("approve-dispatch", {})}
          disabled={pending !== null}
          className="rounded-md bg-[color:var(--ag-ai-blue)] px-3.5 py-1.5 text-[12px] font-medium text-[color:var(--ag-bg-deep)] disabled:opacity-50"
        >
          {pending === "approve" ? "…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => post("cancel-dispatch", { reason: "user_denied" })}
          disabled={pending !== null}
          className="rounded-md border border-white/15 px-3.5 py-1.5 text-[12px] text-white/70 disabled:opacity-50"
        >
          {pending === "deny" ? "…" : "Deny"}
        </button>
        <span className="flex-1" />
        <span className="self-center font-mono text-[10px] opacity-50">
          Decisions are logged as Operations
        </span>
      </div>
    </div>
  );
}
