import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface SectionShape {
  title?: string;
  level?: number;
}

/**
 * section — structural grouping with an optional heading. Children render
 * via the flattenNodes pre-order walk in SessionCanvas, so this component
 * only renders the heading itself.
 */
export function SectionIntent({ node }: Props) {
  const intent = node.intent as unknown as SectionShape;
  if (!intent.title) return null;
  const level = Math.min(Math.max(intent.level ?? 2, 1), 4);
  const size = ["text-[18px]", "text-[15.5px]", "text-[13.5px]", "text-[12px]"][
    level - 1
  ];
  return (
    <div
      className={`mt-3 mb-2 font-mono uppercase tracking-[0.06em] opacity-65 ${size}`}
    >
      {intent.title}
    </div>
  );
}
