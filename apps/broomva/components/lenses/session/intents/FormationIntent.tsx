import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface FormationShape {
  label?: string;
  layout?: "row" | "column" | "grid";
}

/**
 * formation — multi-node group with a custom layout hint. v1 renders as
 * a labelled bordered box; children below are positioned by the canvas's
 * pre-order walk (which doesn't honor layout=row/grid yet). v1.1 polish:
 * actually arrange children when layout != "column".
 */
export function FormationIntent({ node }: Props) {
  const intent = node.intent as unknown as FormationShape;
  return (
    <div className="my-3 rounded-md border border-dashed border-white/15 px-3 py-2">
      {intent.label && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-60">
          {intent.label}
          {intent.layout ? ` · ${intent.layout}` : ""}
        </div>
      )}
    </div>
  );
}
