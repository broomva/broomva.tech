import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface BashArgs {
  command?: string;
  args?: string[];
  cwd?: string;
}

interface BashResult {
  ok?: boolean;
  success?: boolean;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  payload?: { stdout?: string; stderr?: string; exit_code?: number };
  latency_ms?: number;
}

/**
 * bash tool card — terminal-style stdout/stderr/exit_code render. This is
 * the escape hatch tool; rendering is deliberately monospace-heavy and
 * scrollable. Exit code shown as a small chip.
 */
export function BashCard({ node }: Props) {
  const intent = node.intent as unknown as { args?: BashArgs };
  const r =
    (node as { result?: BashResult; attrs?: { result?: BashResult } }).result ??
    (node as { attrs?: { result?: BashResult } }).attrs?.result;
  const result = r?.payload ?? r ?? {};
  const cmd = intent.args?.command ?? "";
  const args = intent.args?.args ?? [];
  const cwd = intent.args?.cwd;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exit = result.exit_code;
  const status: "ok" | "error" | "running" =
    exit === undefined ? "running" : exit === 0 ? "ok" : "error";

  return (
    <div className="ag-glass-subtle mb-[18px] rounded-lg border border-white/15 bg-black/30 p-3">
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="font-medium text-white">$</span>
        <span className="truncate">
          <span className="text-[color:var(--ag-ai-blue)]">{cmd}</span>
          {args.length > 0 && (
            <span className="opacity-80"> {args.join(" ")}</span>
          )}
        </span>
        <span className="flex-1" />
        {cwd && <span className="opacity-50">cwd: {cwd}</span>}
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
          style={{
            background:
              status === "ok"
                ? "color-mix(in oklab, var(--ag-success) 18%, transparent)"
                : status === "error"
                  ? "color-mix(in oklab, var(--ag-error) 18%, transparent)"
                  : "color-mix(in oklab, var(--ag-warning) 18%, transparent)",
            color:
              status === "ok"
                ? "var(--ag-success)"
                : status === "error"
                  ? "var(--ag-error)"
                  : "var(--ag-warning)",
          }}
        >
          {status === "running" ? "running" : `exit ${exit}`}
        </span>
      </div>
      {(stdout || stderr) && (
        <pre className="mt-2 max-h-[18em] overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 font-mono text-[10.5px] leading-[1.55]">
          {stdout && <span className="opacity-90">{stdout}</span>}
          {stderr && (
            <span className="text-[color:var(--ag-error)]">
              {stdout ? "\n" : ""}
              {stderr}
            </span>
          )}
        </pre>
      )}
    </div>
  );
}
