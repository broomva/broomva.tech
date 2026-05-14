"use client";

import type { SceneNode } from "@broomva/prosopon";
import { useState } from "react";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface InputShape {
  prompt?: string;
  placeholder?: string;
  dispatch_id?: string;
}

export function InputIntent({ node, sid }: Props) {
  const intent = node.intent as unknown as InputShape;
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!sid || !intent.dispatch_id || !value.trim() || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/life-proxy/agent/approve-dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sid,
          dispatchId: intent.dispatch_id,
          text: value,
        }),
      });
      if (res.ok) setSubmitted(true);
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="mb-[22px] rounded-[10px] border border-[color:var(--ag-success)]/25 bg-[color:var(--ag-success)]/[0.05] px-3 py-2.5">
        <div className="font-mono text-[11px] opacity-80">
          submitted: <span className="opacity-100">{value}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-[22px] rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-3">
      {intent.prompt && (
        <div className="mb-2 text-[13px] opacity-90">{intent.prompt}</div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={intent.placeholder}
          className="flex-1 rounded-md border border-white/15 bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[color:var(--ag-border-focus)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || pending}
          className="rounded-md bg-[color:var(--ag-ai-blue)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ag-bg-deep)] disabled:opacity-50"
        >
          {pending ? "…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
