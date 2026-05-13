import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface GroupShape {
  label?: string;
}

/**
 * group — semantic grouping, no visual treatment beyond an optional label.
 * Children are rendered in pre-order by SessionCanvas; this component only
 * surfaces the label if present.
 */
export function GroupIntent({ node }: Props) {
  const intent = node.intent as unknown as GroupShape;
  if (!intent.label) return null;
  return (
    <div className="my-1 font-mono text-[10px] uppercase tracking-[0.08em] opacity-50">
      {intent.label}
    </div>
  );
}
