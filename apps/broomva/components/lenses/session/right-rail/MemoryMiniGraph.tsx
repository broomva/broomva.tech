"use client";

import { useMemo } from "react";
import { useSceneContext } from "../SceneContext";

interface Touched {
  id: string;
  label: string;
}

/**
 * MemoryMiniGraph — small radial graph of memory entities touched in the
 * current session. Reads memory.touch / memory.query / memory.write
 * tool_calls and entity_ref intents. Renders up to 7 nodes in a radial
 * layout with a central node + spokes.
 *
 * Pure SVG; no chart library. Empty state when no memory activity yet.
 */
export function MemoryMiniGraph() {
  const { scene } = useSceneContext();

  const touched = useMemo<Touched[]>(() => {
    const found = new Map<string, Touched>();
    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
        label?: string;
        id?: string;
      };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      const intent = n.intent;
      if (intent && discriminator === "tool_call") {
        const name = intent.name ?? intent.tool ?? "";
        if (name.startsWith("memory.")) {
          const scope = (intent.args?.scope as string | undefined) ?? "";
          const node =
            (intent.args?.node as
              | { label?: string; id?: string }
              | undefined) ?? {};
          const label = node.label ?? node.id ?? scope;
          if (label && !found.has(label)) {
            found.set(label, { id: label, label });
          }
        }
      }
      if (intent && discriminator === "entity_ref") {
        const label = intent.label ?? intent.id ?? "";
        if (label && !found.has(label)) {
          found.set(label, { id: label, label });
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };
    const root = (scene as unknown as { root?: unknown }).root;
    if (root) walk(root as never);
    return Array.from(found.values()).slice(0, 7);
  }, [scene]);

  if (touched.length === 0) {
    return <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>;
  }

  const center = touched[0];
  const peripherals = touched.slice(1);
  const n = peripherals.length;
  const cx = 50;
  const cy = 50;
  const r = 32;

  return (
    <div className="ag-glass-subtle relative h-[140px] rounded-md border border-white/10 p-3">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)]"
        aria-hidden
      >
        {peripherals.map((p, i) => {
          const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          return (
            <line
              key={p.id}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(96,165,250,.4)"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <div
        className="absolute font-mono text-[9px]"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "var(--ag-ai-blue)",
          color: "var(--ag-bg-deep)",
          padding: "3px 6px",
          borderRadius: "4px",
          fontWeight: 500,
          whiteSpace: "nowrap",
          maxWidth: "12ch",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {center.label}
      </div>
      {peripherals.map((p, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        return (
          <div
            key={p.id}
            className="absolute font-mono text-[8.5px]"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              background:
                "color-mix(in oklab, var(--ag-ai-blue) 20%, transparent)",
              border:
                "1px solid color-mix(in oklab, var(--ag-ai-blue) 40%, transparent)",
              color: "rgba(255,255,255,.85)",
              padding: "2px 5px",
              borderRadius: "3px",
              whiteSpace: "nowrap",
              maxWidth: "10ch",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {p.label}
          </div>
        );
      })}
      <div className="absolute bottom-1 left-0 right-0 text-center font-mono text-[9px] opacity-55">
        {touched.length} node{touched.length === 1 ? "" : "s"} touched
      </div>
    </div>
  );
}
