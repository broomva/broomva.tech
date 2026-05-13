import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface ImageIntentShape {
  src?: string;
  url?: string;
  alt?: string;
  caption?: string;
  hash?: string;
}

export function ImageIntent({ node }: Props) {
  const intent = node.intent as unknown as ImageIntentShape;
  const src = intent.src ?? intent.url;
  if (!src) return null;
  return (
    <div className="mb-[22px]">
      <div className="overflow-hidden rounded-lg border border-white/10">
        <img
          src={src}
          alt={intent.alt ?? ""}
          className="block max-h-[60vh] w-full object-contain"
        />
      </div>
      {(intent.caption || intent.hash) && (
        <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] opacity-65">
          {intent.caption && <span>{intent.caption}</span>}
          {intent.hash && (
            <span className="ml-auto opacity-50">
              hash {intent.hash.slice(0, 12)}…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
