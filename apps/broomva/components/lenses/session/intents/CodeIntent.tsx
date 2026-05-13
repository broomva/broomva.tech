import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface CodeIntentShape {
  language?: string;
  lang?: string;
  text?: string;
  source?: string;
}

export function CodeIntent({ node }: Props) {
  const intent = node.intent as unknown as CodeIntentShape;
  const lang = intent.language ?? intent.lang ?? "";
  const source = intent.text ?? intent.source ?? "";
  return (
    <div className="mb-[22px]">
      {lang && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
          {lang}
        </div>
      )}
      <pre className="overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-[1.6]">
        <code>{source}</code>
      </pre>
    </div>
  );
}
