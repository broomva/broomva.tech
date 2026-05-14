import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface MathIntentShape {
  tex?: string;
  latex?: string;
  inline?: boolean;
}

/**
 * Math intent — renders LaTeX. v1 ships a minimal monospace fallback (the
 * raw TeX source in a code block) so we don't pull in KaTeX as a dep on
 * this PR. v1.1 polish task: swap to KaTeX render once a math-heavy use
 * case lands.
 */
export function MathIntent({ node }: Props) {
  const intent = node.intent as unknown as MathIntentShape;
  const tex = intent.tex ?? intent.latex ?? "";
  if (!tex) return null;
  if (intent.inline) {
    return (
      <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[12.5px]">
        {tex}
      </code>
    );
  }
  return (
    <div className="mb-[22px]">
      <pre className="rounded-lg border border-white/10 bg-black/30 p-3 text-center font-mono text-[13.5px] leading-[1.6]">
        {tex}
      </pre>
    </div>
  );
}
