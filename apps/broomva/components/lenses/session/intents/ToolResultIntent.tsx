import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Standalone tool_result intent — used when the agent emits a result not
 * attached to a prior tool_call node. Rare; usually results patch the
 * call node in place via node_updated. We render a minimal card.
 *
 * Canonical Prosopon `Intent::ToolResult` carries `{ type, success,
 * payload }`. The plan also surfaces `tool` (name) and uses `ok` /
 * `output`; we read whichever fields are present.
 */
export function ToolResultIntent({ node }: Props) {
  const intent = node.intent as {
    type?: "tool_result";
    kind?: "tool_result";
    tool?: string;
    output?: unknown;
    payload?: unknown;
    ok?: boolean;
    success?: boolean;
  };
  const value = intent.output ?? intent.payload;
  const ok = intent.ok ?? intent.success ?? true;
  return (
    <div className="mb-[18px] ag-glass-subtle rounded-lg border border-white/10 p-3 font-mono text-[11px]">
      <div className="opacity-60">
        result · {intent.tool ?? "unknown"} ·{" "}
        <span
          style={{
            color: ok ? "var(--ag-success)" : "var(--ag-error)",
          }}
        >
          {ok ? "ok" : "error"}
        </span>
      </div>
      {value !== undefined && (
        <pre className="mt-1.5 max-h-[10em] overflow-auto whitespace-pre-wrap text-[10.5px] opacity-70">
          {typeof value === "string"
            ? value.slice(0, 600)
            : JSON.stringify(value, null, 2).slice(0, 600)}
        </pre>
      )}
    </div>
  );
}
