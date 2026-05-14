import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface MemoryEntity {
  id?: string;
  type?: string;
  label?: string;
  relation?: string;
  weight?: number;
}

interface MemoryQueryArgs {
  scope?: string;
  depth?: number;
  filter?: string;
}

interface MemoryQueryResult {
  ok?: boolean;
  success?: boolean;
  entities?: MemoryEntity[];
  payload?: MemoryEntity[];
  latency_ms?: number;
}

export function MemoryQueryCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: MemoryQueryArgs };
  const result =
    (
      node as {
        result?: MemoryQueryResult;
        attrs?: { result?: MemoryQueryResult };
      }
    ).result ??
    (node as { attrs?: { result?: MemoryQueryResult } }).attrs?.result;
  const scope = intent.args?.scope ?? "session";
  const entities = result?.entities ?? result?.payload ?? [];
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-accent-blue)]/20 bg-[color:var(--ag-accent-blue)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-accent-blue)]">
          memory.query
        </span>
        <span className="opacity-70">scope: {scope}</span>
        {intent.args?.depth !== undefined && (
          <span className="opacity-60">depth: {intent.args.depth}</span>
        )}
        <span className="flex-1" />
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
          {entities.length > 0 ? `${entities.length} nodes` : status}
        </span>
      </div>
      {entities.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10.5px]">
          {entities.slice(0, 14).map((e, i) => (
            <li
              key={`${e.id ?? e.label}-${i}`}
              className="rounded-md border border-white/10 bg-black/20 px-2 py-1"
            >
              {e.type && <span className="opacity-50">{e.type}: </span>}
              <span>{e.label ?? e.id ?? "(unnamed)"}</span>
              {e.relation && (
                <span className="ml-1 opacity-60">[{e.relation}]</span>
              )}
            </li>
          ))}
          {entities.length > 14 && (
            <li className="opacity-50">… +{entities.length - 14}</li>
          )}
        </ul>
      )}
    </div>
  );
}
