import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface LocusShape {
  lat?: number;
  lon?: number;
  label?: string;
}

/**
 * locus — spatial reference. v1 renders as a compact pill with lat/lon and
 * an optional label. v1.1 polish: embed a small static map tile (requires
 * a tile provider + caching pipeline).
 */
export function LocusIntent({ node }: Props) {
  const intent = node.intent as unknown as LocusShape;
  if (intent.lat === undefined || intent.lon === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[10.5px]">
      <span className="opacity-70">⊕</span>
      <span>
        {intent.lat.toFixed(4)}, {intent.lon.toFixed(4)}
      </span>
      {intent.label && <span className="opacity-60">· {intent.label}</span>}
    </span>
  );
}
