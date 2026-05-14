import type { SceneNode } from "@broomva/prosopon";
import { createTwoFilesPatch } from "diff";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface FileWriteArgs {
  path?: string;
  content?: string;
  prev_content?: string;
}

interface FileWriteResult {
  ok?: boolean;
  success?: boolean;
  bytes_written?: number;
  prev_content?: string;
  unified_diff?: string;
  latency_ms?: number;
}

/**
 * fs.write tool card — renders the diff between prev and new content. Diff
 * is computed client-side via the diff package (Myers algorithm) when the
 * upstream provides prev_content; otherwise renders just the new content
 * with a "+N bytes" badge.
 */
export function FileWriteCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: FileWriteArgs };
  const result =
    (node as { result?: FileWriteResult; attrs?: { result?: FileWriteResult } })
      .result ??
    (node as { attrs?: { result?: FileWriteResult } }).attrs?.result;
  const path = intent.args?.path ?? "(no path)";
  const newContent = intent.args?.content ?? "";
  const prevContent = result?.prev_content ?? intent.args?.prev_content ?? "";
  const status: "ok" | "error" | "running" = result
    ? result.ok === false || result.success === false
      ? "error"
      : "ok"
    : "running";

  const diff = result?.unified_diff
    ? result.unified_diff
    : prevContent && newContent
      ? createTwoFilesPatch(
          path,
          path,
          prevContent,
          newContent,
          undefined,
          undefined,
          { context: 2 },
        )
      : null;

  const adds = diff
    ? diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .length
    : 0;
  const dels = diff
    ? diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))
        .length
    : 0;
  const byteSummary =
    result?.bytes_written !== undefined
      ? `${result.bytes_written} bytes`
      : `${newContent.length} bytes`;

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-[color:var(--ag-warning)]/15 bg-[color:var(--ag-warning)]/[0.04] p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-[color:var(--ag-warning)]">
          fs.write
        </span>
        <span className="opacity-70">{path}</span>
        {diff && (
          <span className="ml-1 font-medium">
            <span className="text-[color:var(--ag-success)]">+{adds}</span>
            <span className="opacity-50">/</span>
            <span className="text-[color:var(--ag-error)]">−{dels}</span>
          </span>
        )}
        <span className="flex-1" />
        <span className="opacity-60">{byteSummary}</span>
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
          {result?.latency_ms !== undefined ? ` · ${result.latency_ms}ms` : ""}
        </span>
      </div>
      {diff ? (
        <pre className="mt-2 max-h-[16em] overflow-auto whitespace-pre rounded bg-black/40 p-2 font-mono text-[10.5px] leading-[1.55]">
          {diff.split("\n").map((line, i) => {
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
        </pre>
      ) : newContent ? (
        <pre className="mt-2 max-h-[12em] overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10.5px] leading-[1.55] opacity-85">
          {newContent.slice(0, 800)}
          {newContent.length > 800 && (
            <span className="opacity-50">{"\n… truncated"}</span>
          )}
        </pre>
      ) : null}
    </div>
  );
}
