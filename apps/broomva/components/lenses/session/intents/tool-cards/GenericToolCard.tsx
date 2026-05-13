import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Generic tool card — fallback that renders any tool_call intent regardless
 * of tool name. Typed cards (FileWriteCard, BashCard, etc.) land in B-4b and
 * register against the same tool_call dispatcher (`ToolCallIntent.TOOL_MAP`).
 *
 * Reads the tool name from either `intent.name` (canonical Prosopon
 * `Intent::ToolCall`) or `intent.tool` (plan-shaped). The completion
 * `result` lives either on the node (legacy patch-in-place) or under
 * `node.attrs.result` (canonical `node_updated` attrs patch).
 */
export function GenericToolCard({ node }: Props) {
  const intent = node.intent as {
    type?: "tool_call";
    kind?: "tool_call";
    name?: string;
    tool?: string;
    args?: unknown;
    dispatch_id?: string;
  };
  const toolName = intent.name ?? intent.tool ?? "unknown";
  const legacyResult = (
    node as {
      result?: {
        ok?: boolean;
        success?: boolean;
        output?: unknown;
        payload?: unknown;
        latency_ms?: number;
      };
    }
  ).result;
  const attrResult = (
    node.attrs as
      | {
          result?: {
            ok?: boolean;
            success?: boolean;
            output?: unknown;
            payload?: unknown;
            latency_ms?: number;
          };
        }
      | undefined
  )?.result;
  const result = legacyResult ?? attrResult;
  const ok =
    result === undefined ? undefined : (result.ok ?? result.success ?? false);
  const status = result === undefined ? "running" : ok ? "ok" : "error";
  const output = result?.output ?? result?.payload;
  const argsJson = intent.args === undefined ? "" : JSON.stringify(intent.args);

  return (
    <div className="mb-[18px] ag-glass-subtle rounded-lg border border-white/10 bg-[color:var(--ag-bg-elevated)]/40 p-3 font-mono text-[11px]">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[color:var(--ag-ai-blue)]">
          {toolName}
        </span>
        {argsJson && (
          <span className="opacity-60">
            ({argsJson.slice(0, 80)}
            {argsJson.length > 80 ? "…" : ""})
          </span>
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
          {status}
          {result?.latency_ms ? ` · ${result.latency_ms}ms` : ""}
        </span>
      </div>
      {output !== undefined && (
        <pre className="mt-1.5 max-h-[10em] overflow-auto whitespace-pre-wrap text-[10.5px] opacity-70">
          {typeof output === "string"
            ? output.slice(0, 600)
            : JSON.stringify(output, null, 2).slice(0, 600)}
        </pre>
      )}
    </div>
  );
}
