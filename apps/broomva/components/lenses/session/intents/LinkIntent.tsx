import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface LinkShape {
  href?: string;
  url?: string;
  label?: string;
  text?: string;
}

export function LinkIntent({ node }: Props) {
  const intent = node.intent as unknown as LinkShape;
  const href = intent.href ?? intent.url;
  const text = intent.label ?? intent.text ?? href;
  if (!href) return <span>{text}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-[color:var(--ag-ai-blue)] underline underline-offset-2 hover:opacity-90"
    >
      {text}
      <span aria-hidden className="text-[0.75em] opacity-70">
        ↗
      </span>
    </a>
  );
}
