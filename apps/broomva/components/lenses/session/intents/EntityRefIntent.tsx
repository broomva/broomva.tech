import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface EntityRefShape {
  id?: string;
  label?: string;
  kind?: string;
}

/**
 * entity_ref — inline reference to a memory/file entity. v1 renders as a
 * dotted-underline link with a subtle accent color; click is a noop until
 * the Memory lens (B-4c+) ships an entity inspector overlay.
 */
export function EntityRefIntent({ node }: Props) {
  const intent = node.intent as unknown as EntityRefShape;
  const label = intent.label ?? intent.id ?? "(entity)";
  return (
    <span
      className="cursor-pointer text-[color:var(--ag-accent-blue)] underline decoration-dotted decoration-[1.5px] underline-offset-2"
      title={intent.kind ? `${intent.kind}: ${label}` : label}
    >
      {label}
    </span>
  );
}
