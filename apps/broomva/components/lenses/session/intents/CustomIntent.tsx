import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface CustomShape {
  kind?: string;
  payload?: unknown;
}

/**
 * custom — escape hatch for app-specific intents the canonical grammar
 * doesn't model. v1 renders kind label + JSON-stringified payload in a
 * collapsible monospace block.
 */
export function CustomIntent({ node }: Props) {
  const intent = node.intent as unknown as CustomShape;
  const kind = intent.kind ?? "custom";
  const body =
    intent.payload !== undefined ? JSON.stringify(intent.payload, null, 2) : "";
  return (
    <details className="ag-glass-subtle mb-[18px] rounded-md border border-white/10 px-3 py-2 font-mono text-[11px]">
      <summary className="cursor-pointer opacity-70">custom · {kind}</summary>
      {body && (
        <pre className="mt-1.5 max-h-[10em] overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[10.5px] leading-[1.55] opacity-85">
          {body.slice(0, 800)}
          {body.length > 800 && (
            <span className="opacity-50">{"\n… truncated"}</span>
          )}
        </pre>
      )}
    </details>
  );
}
