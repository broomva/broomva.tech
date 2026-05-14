import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface FileReadArgs {
  path?: string;
}

interface FileReadResult {
  ok?: boolean;
  success?: boolean;
  content?: string;
  payload?: string;
  bytes?: number;
  frontmatter?: Record<string, unknown>;
  latency_ms?: number;
}

/**
 * fs.read tool card — file path, status, frontmatter, ~10-line preview.
 *
 * Pulls path from args.path; result body from result.content or result.payload
 * (canonical vs plan-extension wire shape). Renders a quiet card; click to
 * open in Files lens (deferred to B-4c when the Files lens ships).
 */
export function FileReadCard({ node }: Props) {
  const intent = node.intent as unknown as {
    name?: string;
    tool?: string;
    args?: FileReadArgs;
  };
  const result =
    (node as { result?: FileReadResult; attrs?: { result?: FileReadResult } })
      .result ??
    (node as { attrs?: { result?: FileReadResult } }).attrs?.result;
  const path = intent.args?.path ?? "(no path)";
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";
  const content = result?.content ?? result?.payload ?? "";
  const lines = content.split("\n").slice(0, 10);
  const truncated = content.split("\n").length > 10;

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-ai-blue)]/15 bg-[color:var(--ag-ai-blue)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-ai-blue)]">
          fs.read
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
          {status === "running" ? "reading" : status}
          {result?.latency_ms !== undefined ? ` · ${result.latency_ms}ms` : ""}
        </span>
      </div>
      {result?.frontmatter && Object.keys(result.frontmatter).length > 0 && (
        <div className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] opacity-80">
          {Object.entries(result.frontmatter)
            .slice(0, 5)
            .map(([k, v]) => (
              <>
                <span key={`${k}-k`} className="opacity-60">
                  {k}
                </span>
                <span key={`${k}-v`}>{String(v).slice(0, 80)}</span>
              </>
            ))}
        </div>
      )}
      {lines.length > 0 && lines[0] !== "" && (
        <pre className="mt-2 max-h-[12em] overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10.5px] leading-[1.55] opacity-85">
          {lines.join("\n")}
          {truncated && (
            <span className="opacity-50">{"\n… preview truncated"}</span>
          )}
        </pre>
      )}
    </div>
  );
}
