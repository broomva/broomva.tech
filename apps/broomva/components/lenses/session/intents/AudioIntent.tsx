import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface AudioIntentShape {
  src?: string;
  url?: string;
  duration_ms?: number;
  caption?: string;
}

export function AudioIntent({ node }: Props) {
  const intent = node.intent as unknown as AudioIntentShape;
  const src = intent.src ?? intent.url;
  if (!src) return null;
  return (
    <div className="mb-[22px]">
      {/* biome-ignore lint/a11y/useMediaCaption: caption is in the prose intent that prompted this audio; embedded captions are a v1.1 polish. */}
      <audio src={src} controls preload="metadata" className="w-full" />
      {intent.caption && (
        <div className="mt-1.5 font-mono text-[10.5px] opacity-65">
          {intent.caption}
        </div>
      )}
    </div>
  );
}
