import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface PatchArgs {
  patch?: string;
  files?: string[];
}

interface PatchResult {
  ok?: boolean;
  success?: boolean;
  applied?: number;
  rejected?: number;
  latency_ms?: number;
}

/**
 * fs.apply_patch tool card — renders multi-hunk unified diff with per-line
 * coloring. Pulls patch text from args.patch (the input). Result summary
 * shows how many hunks applied vs rejected.
 */
export function PatchCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: PatchArgs };
  const result =
    (node as { result?: PatchResult; attrs?: { result?: PatchResult } })
      .result ?? (node as { attrs?: { result?: PatchResult } }).attrs?.result;
  const patch = intent.args?.patch ?? "";
  const files = intent.args?.files ?? [];
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-warning)]/15 bg-[color:var(--ag-warning)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-warning)]">
          fs.apply_patch
        </span>
        {files.length > 0 && (
          <span className="opacity-70">{files.length} files</span>
        )}
        <span className="flex-1" />
        {result && (
          <span className="opacity-70">
            applied {result.applied ?? 0}
            {result.rejected ? `, rejected ${result.rejected}` : ""}
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
          {status === "running" ? "applying" : status}
          {result?.latency_ms !== undefined ? ` · ${result.latency_ms}ms` : ""}
        </span>
      </div>
      {patch && (
        <pre className="mt-2 max-h-[18em] overflow-auto whitespace-pre rounded bg-black/40 p-2 font-mono text-[10.5px] leading-[1.55]">
          {patch
            .split("\n")
            .slice(0, 60)
            .map((line, i) => {
              const cls =
                line.startsWith("+++") || line.startsWith("---")
                  ? "opacity-50"
                  : line.startsWith("+")
                    ? "text-[color:var(--ag-success)]"
                    : line.startsWith("-")
                      ? "text-[color:var(--ag-error)]"
                      : line.startsWith("@@")
                        ? "text-[color:var(--ag-ai-blue)] opacity-80"
                        : "opacity-80";
              return (
                <span key={`${i}-${line.slice(0, 8)}`} className={cls}>
                  {line}
                  {"\n"}
                </span>
              );
            })}
          {patch.split("\n").length > 60 && (
            <span className="opacity-50">… patch truncated</span>
          )}
        </pre>
      )}
    </div>
  );
}
