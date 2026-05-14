import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface VideoIntentShape {
  src?: string;
  url?: string;
  poster?: string;
  caption?: string;
}

export function VideoIntent({ node }: Props) {
  const intent = node.intent as unknown as VideoIntentShape;
  const src = intent.src ?? intent.url;
  if (!src) return null;
  return (
    <div className="mb-[22px]">
      {/* biome-ignore lint/a11y/useMediaCaption: caption rendered as text below; full subtitles are v1.1. */}
      <video
        src={src}
        poster={intent.poster}
        controls
        preload="metadata"
        className="w-full max-h-[60vh] rounded-lg border border-white/10"
      />
      {intent.caption && (
        <div className="mt-1.5 font-mono text-[10.5px] opacity-65">
          {intent.caption}
        </div>
      )}
    </div>
  );
}
