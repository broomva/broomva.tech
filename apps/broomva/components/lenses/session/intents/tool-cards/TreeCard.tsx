import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface TreeEntry {
  name: string;
  kind?: "file" | "dir";
  size?: number;
}

interface FsListArgs {
  path?: string;
}

interface FsListResult {
  ok?: boolean;
  success?: boolean;
  entries?: TreeEntry[];
  payload?: TreeEntry[];
  latency_ms?: number;
}

export function TreeCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: FsListArgs };
  const result =
    (node as { result?: FsListResult; attrs?: { result?: FsListResult } })
      .result ?? (node as { attrs?: { result?: FsListResult } }).attrs?.result;
  const path = intent.args?.path ?? "/";
  const entries = result?.entries ?? result?.payload ?? [];
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-ai-blue)]/15 bg-[color:var(--ag-ai-blue)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-ai-blue)]">
          fs.list
        </span>
        <span className="opacity-70">{path}</span>
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
          {entries.length > 0 ? `${entries.length} entries` : status}
        </span>
      </div>
      {entries.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10.5px]">
          {entries.slice(0, 20).map((e, i) => (
            <li key={`${e.name}-${i}`} className="truncate">
              <span className="opacity-60">
                {e.kind === "dir" ? "▸ " : "  "}
              </span>
              <span>{e.name}</span>
              {e.kind === "dir" && <span className="opacity-50">/</span>}
            </li>
          ))}
          {entries.length > 20 && (
            <li className="col-span-2 opacity-50">
              … {entries.length - 20} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
