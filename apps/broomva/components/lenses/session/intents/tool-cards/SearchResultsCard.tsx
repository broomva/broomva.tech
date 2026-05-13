import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface SearchMatch {
  path: string;
  line?: number;
  text?: string;
}

interface SearchArgs {
  query?: string;
  pattern?: string;
  glob?: string;
}

interface SearchResult {
  ok?: boolean;
  success?: boolean;
  matches?: SearchMatch[];
  payload?: SearchMatch[];
  latency_ms?: number;
}

export function SearchResultsCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: SearchArgs };
  const result =
    (node as { result?: SearchResult; attrs?: { result?: SearchResult } })
      .result ?? (node as { attrs?: { result?: SearchResult } }).attrs?.result;
  const query = intent.args?.query ?? intent.args?.pattern ?? "(no query)";
  const matches = result?.matches ?? result?.payload ?? [];
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-ai-blue)]/15 bg-[color:var(--ag-ai-blue)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-ai-blue)]">
          fs.search
        </span>
        <span className="opacity-70">"{query}"</span>
        {intent.args?.glob && (
          <span className="opacity-60">· glob: {intent.args.glob}</span>
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
          {matches.length > 0 ? `${matches.length} matches` : status}
        </span>
      </div>
      {matches.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 font-mono text-[10.5px]">
          {matches.slice(0, 12).map((m, i) => (
            <li
              key={`${m.path}-${m.line}-${i}`}
              className="rounded bg-black/20 p-1.5"
            >
              <div className="opacity-80">
                {m.path}
                {m.line !== undefined && (
                  <span className="opacity-50">:{m.line}</span>
                )}
              </div>
              {m.text && (
                <div className="mt-0.5 truncate opacity-70">{m.text}</div>
              )}
            </li>
          ))}
          {matches.length > 12 && (
            <li className="opacity-50">… {matches.length - 12} more matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
