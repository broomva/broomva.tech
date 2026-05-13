import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

interface SignalShape {
  topic?: string;
  value?: number;
  values?: number[];
  unit?: string;
}

/**
 * signal — tiny sparkline of recent values for a named topic
 * (e.g. haima.spend.cents, autonomic.gating.score). v1 renders a 12-point
 * inline SVG; values are clamped 0..1 by topic-relative min/max.
 */
export function SignalIntent({ node }: Props) {
  const intent = node.intent as unknown as SignalShape;
  const values =
    intent.values ?? (intent.value !== undefined ? [intent.value] : []);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 22;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`,
    )
    .join(" ");
  const last = values[values.length - 1];

  return (
    <div className="mb-[14px] inline-flex items-center gap-2 rounded-md border border-white/8 bg-black/20 px-2 py-1 font-mono text-[10.5px]">
      <span className="opacity-65">{intent.topic ?? "signal"}</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <polyline
          fill="none"
          stroke="var(--ag-ai-blue)"
          strokeWidth={1}
          points={points}
        />
      </svg>
      <span className="font-medium">
        {last}
        {intent.unit && <span className="opacity-60"> {intent.unit}</span>}
      </span>
    </div>
  );
}
