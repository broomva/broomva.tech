import type { SceneNode } from "@broomva/prosopon";
import styles from "./StreamIntent.module.css";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Streaming text node — same look as ProseIntent (assistant serif voice)
 * with a tail cursor pulse while still streaming. Canonical Prosopon
 * `Intent::Stream` carries `{ type, id, kind }` and content arrives via
 * `stream_chunk` events; until the upstream finalizer mutates the node
 * (`done: true` or replacing intent with a Prose), we render the cursor.
 *
 * `text` is read off the intent eagerly (some emitters mirror chunks
 * onto the node intent for compositor convenience).
 */
export function StreamIntent({ node }: Props) {
  // Canonical `Intent::Stream` is `{ type, id, kind }`; emitters that
  // mirror text/done onto the node intent ship this extended shape.
  // Cast through unknown to read both safely.
  const intent = node.intent as unknown as {
    type?: "stream";
    kind?: "stream";
    text?: string;
    done?: boolean;
  };
  const text = intent.text ?? "";
  return (
    <div className="mb-[22px]">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-55 text-[color:var(--ag-ai-blue)]">
        Agent
      </div>
      <div
        className="text-[15.5px] leading-[1.8] text-white/90"
        style={{
          fontFamily: "'Source Serif Pro', Charter, Cambria, Georgia, serif",
        }}
      >
        {text}
        {!intent.done && <span className={styles.cursor} aria-hidden />}
      </div>
    </div>
  );
}
