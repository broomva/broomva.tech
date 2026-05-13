import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Fallback for unhandled intent kinds. Renders a quiet placeholder so the
 * scene keeps reducing forward even when the agent emits an intent the UI
 * doesn't recognize. Crucial for forward compatibility.
 *
 * Reads either `intent.type` (canonical Prosopon discriminator) or
 * `intent.kind` (plan-shaped extension intents like approval_required)
 * so both shapes degrade gracefully.
 */
export function UnknownIntent({ node }: Props) {
  const intent = node.intent as { type?: string; kind?: string };
  const label = intent.type ?? intent.kind ?? "unknown";
  return (
    <div className="my-2 px-3 py-2 text-[11px] font-mono opacity-50">
      [unrendered intent: {label}]
    </div>
  );
}
