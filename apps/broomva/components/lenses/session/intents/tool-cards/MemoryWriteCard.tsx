import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface MemoryWriteArgs {
  node?: { id?: string; type?: string; label?: string; body?: string };
  provenance?: string;
}

interface MemoryWriteResult {
  ok?: boolean;
  success?: boolean;
  proposed_id?: string;
  status_kind?: "auto" | "review" | "denied";
  latency_ms?: number;
}

export function MemoryWriteCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: MemoryWriteArgs };
  const result =
    (
      node as {
        result?: MemoryWriteResult;
        attrs?: { result?: MemoryWriteResult };
      }
    ).result ??
    (node as { attrs?: { result?: MemoryWriteResult } }).attrs?.result;
  const mn = intent.args?.node ?? {};
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-accent-blue)]/20 bg-[color:var(--ag-accent-blue)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-accent-blue)]">
          memory.write
        </span>
        {mn.type && <span className="opacity-70">{mn.type}</span>}
        <span className="flex-1" />
        {result?.status_kind && (
          <span
            className="text-[10px] opacity-80"
            style={{
              color:
                result.status_kind === "auto"
                  ? "var(--ag-success)"
                  : result.status_kind === "review"
                    ? "var(--ag-warning)"
                    : "var(--ag-error)",
            }}
          >
            {result.status_kind}
          </span>
        )}
        <span
          className="inline-flex items-center gap-1 text-[10px]"
          style={{
            color:
              status === "ok"
                ? "var(--ag-success)"
                : status === "error"
                  ? "var(--ag-error)"
                  : "var(--ag-warning)",
          }}
        >
          <span
            className="h-1 w-1 rounded-full"
            style={{
              background:
                status === "ok"
                  ? "var(--ag-success)"
                  : status === "error"
                    ? "var(--ag-error)"
                    : "var(--ag-warning)",
            }}
          />
          {status === "running" ? "writing" : status}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[11px]">
        <span className="opacity-60">label: </span>
        <span>{mn.label ?? mn.id ?? "(unlabelled)"}</span>
      </div>
      {mn.body && (
        <div className="mt-1.5 max-h-[6em] overflow-auto rounded bg-black/20 p-2 text-[11.5px] leading-[1.6] opacity-85">
          {mn.body.slice(0, 300)}
          {mn.body.length > 300 && <span className="opacity-50">…</span>}
        </div>
      )}
      {intent.args?.provenance && (
        <div className="mt-1 font-mono text-[10px] opacity-50">
          via {intent.args.provenance}
        </div>
      )}
    </div>
  );
}
