import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface CitationShape {
  label?: string;
  ordinal?: number;
  source?: string;
  source_url?: string;
}

/**
 * citation — footnote-style superscript marker. Hovering reveals the source.
 * v1 shows source as a tooltip via `title`; v1.1 polish swaps to a styled
 * hover-card overlay.
 */
export function CitationIntent({ node }: Props) {
  const intent = node.intent as unknown as CitationShape;
  const label =
    intent.label ??
    (intent.ordinal !== undefined ? `${intent.ordinal}` : "src");
  const title = intent.source ?? intent.source_url ?? "(source not provided)";
  return (
    <sup>
      <a
        href={intent.source_url ?? "#"}
        onClick={(e) => {
          if (!intent.source_url) e.preventDefault();
        }}
        target={intent.source_url ? "_blank" : undefined}
        rel="noopener noreferrer"
        title={title}
        className="rounded bg-[color:var(--ag-bg-elevated)] px-1 py-0.5 font-mono text-[9px] text-[color:var(--ag-ai-blue)] no-underline hover:opacity-80"
      >
        [{label}]
      </a>
    </sup>
  );
}
