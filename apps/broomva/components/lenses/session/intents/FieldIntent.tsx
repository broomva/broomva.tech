"use client";

import type { SceneNode } from "@broomva/prosopon";
import { useState } from "react";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface FieldDef {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

interface FieldShape {
  prompt?: string;
  fields?: FieldDef[];
  dispatch_id?: string;
}

export function FieldIntent({ node, sid }: Props) {
  const intent = node.intent as unknown as FieldShape;
  const fields = intent.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!sid || !intent.dispatch_id || pending) return;
    const missing = fields.filter(
      (f) => f.required && !(values[f.name] ?? "").trim(),
    );
    if (missing.length > 0) return;
    setPending(true);
    try {
      await fetch("/api/life-proxy/agent/approve-dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sid,
          dispatchId: intent.dispatch_id,
          fields: values,
        }),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mb-[22px] rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-3">
      {intent.prompt && (
        <div className="mb-3 text-[13px] opacity-90">{intent.prompt}</div>
      )}
      <div className="flex flex-col gap-2">
        {fields.map((f) => (
          <label
            key={f.name}
            className="flex flex-col gap-1 font-mono text-[10.5px]"
          >
            <span className="opacity-65">
              {f.label ?? f.name}
              {f.required && (
                <span className="text-[color:var(--ag-error)]"> *</span>
              )}
            </span>
            <input
              type="text"
              value={values[f.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.name]: e.target.value }))
              }
              placeholder={f.placeholder}
              className="rounded-md border border-white/15 bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[color:var(--ag-border-focus)]"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-3 rounded-md bg-[color:var(--ag-ai-blue)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--ag-bg-deep)] disabled:opacity-50"
      >
        {pending ? "…" : "Submit"}
      </button>
    </div>
  );
}
