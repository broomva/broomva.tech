import type { SceneNode } from "@broomva/prosopon";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Progress intent — slim animated indicator. Determinate bar if a pct
 * (or value/total) is available; indeterminate spinner otherwise.
 *
 * Canonical Prosopon `Intent::Progress` carries `{ label?, pct? }` where
 * `pct` is a 0..1 fraction. We also accept the plan's `value`/`total`
 * shape for forward-compat with emitters that count discrete units.
 */
export function ProgressIntent({ node }: Props) {
  const intent = node.intent as {
    type?: "progress";
    kind?: "progress";
    label?: string;
    pct?: number;
    value?: number;
    total?: number;
  };
  const fraction =
    typeof intent.pct === "number"
      ? intent.pct
      : typeof intent.value === "number" &&
          typeof intent.total === "number" &&
          intent.total > 0
        ? intent.value / intent.total
        : null;
  const pct =
    fraction === null ? null : Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="mb-[18px] flex items-center gap-3">
      {pct === null ? (
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[color:var(--ag-ai-blue)]" />
      ) : (
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
          <span
            className="block h-full bg-[color:var(--ag-ai-blue)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
      {intent.label && (
        <span className="font-mono text-[11px] opacity-65">{intent.label}</span>
      )}
    </div>
  );
}
