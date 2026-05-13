import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Prose intent — serif voice for assistant, sans for user. Renders the
 * intent's text directly. Markdown rendering is a v1.1 polish; v1 ships
 * plain text with whitespace preserved.
 *
 * The canonical Prosopon `Intent::Prose` carries only `{ type, text }` —
 * the `author` field is a plan-level extension. We read it via attrs
 * (`node.attrs.semantic_role === "user"`) when present, fall back to
 * an explicit `author` field, and default to agent.
 */
export function ProseIntent({ node }: Props) {
  const intent = node.intent as {
    type?: "prose";
    kind?: "prose";
    text: string;
    author?: "agent" | "user";
  };
  const attrAuthor = (node.attrs as { author?: "agent" | "user" } | undefined)
    ?.author;
  const author = intent.author ?? attrAuthor ?? "agent";
  const isUser = author === "user";
  return (
    <div className="mb-[22px]">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
        {isUser ? "User" : "Agent"}
      </div>
      <div
        className={
          isUser
            ? "text-[14.5px] leading-[1.75] opacity-95"
            : "text-[15.5px] leading-[1.8] text-white/90"
        }
        style={
          isUser
            ? { fontFamily: "Inter, -apple-system, sans-serif" }
            : {
                fontFamily:
                  "'Source Serif Pro', Charter, Cambria, Georgia, serif",
              }
        }
      >
        {intent.text}
      </div>
    </div>
  );
}
