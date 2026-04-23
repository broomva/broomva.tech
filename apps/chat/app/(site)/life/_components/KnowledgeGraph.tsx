"use client";

import { useMemo } from "react";
import { LIFE_GRAPH } from "../_lib/mock-workspace";

const W = 600;
const H = 480;

export function KnowledgeGraph() {
  const { nodes, edges } = LIFE_GRAPH;
  const pos = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) m[n.id] = { x: n.x * W, y: n.y * H };
    return m;
  }, [nodes]);

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <title>Lago knowledge graph</title>
        <defs>
          <radialGradient id="nglow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="oklch(0.60 0.12 260 / 0.7)" />
            <stop offset="100%" stopColor="oklch(0.60 0.12 260 / 0)" />
          </radialGradient>
          <radialGradient id="nglowFresh" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="oklch(0.65 0.14 235 / 0.9)" />
            <stop offset="100%" stopColor="oklch(0.65 0.14 235 / 0)" />
          </radialGradient>
        </defs>
        {edges.map((e) => {
          const a = pos[e.a];
          const b = pos[e.b];
          if (!a || !b) return null;
          return (
            <line
              key={`${e.a}-${e.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={
                e.fresh
                  ? "oklch(0.65 0.14 235 / 0.6)"
                  : "oklch(0.40 0.02 275 / 0.45)"
              }
              strokeWidth={e.fresh ? 1.5 : 1}
              strokeDasharray={e.fresh ? "none" : "3 3"}
            />
          );
        })}
        {nodes.map((n) => {
          const p = pos[n.id];
          if (!p) return null;
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
              <circle
                r={n.r + 10}
                fill={n.fresh ? "url(#nglowFresh)" : "url(#nglow)"}
              />
              <circle
                r={n.r}
                fill={
                  n.kind === "paper"
                    ? "oklch(0.65 0.14 235 / 0.3)"
                    : n.kind === "artifact"
                      ? "oklch(0.70 0.15 300 / 0.25)"
                      : "oklch(0.22 0.03 275)"
                }
                stroke={
                  n.fresh
                    ? "oklch(0.65 0.14 235)"
                    : "oklch(0.50 0.02 275 / 0.7)"
                }
                strokeWidth={n.fresh ? 1.5 : 1}
              />
              <text
                y={n.r + 14}
                textAnchor="middle"
                fill="oklch(0.70 0.02 275)"
                fontSize="10"
                fontFamily="var(--ag-font-mono)"
                style={{ letterSpacing: "0.03em" }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="graph-legend">
        <span>
          <i style={{ background: "oklch(0.65 0.14 235)" }} /> paper
        </span>
        <span>
          <i
            style={{
              background: "oklch(0.22 0.03 275)",
              border: "1px solid oklch(0.50 0.02 275)",
            }}
          />{" "}
          concept
        </span>
        <span>
          <i style={{ background: "oklch(0.70 0.15 300 / 0.5)" }} /> artifact
        </span>
        <span>
          <i
            style={{
              background: "oklch(0.65 0.14 235)",
              boxShadow: "0 0 6px oklch(0.65 0.14 235)",
            }}
          />{" "}
          new this tick
        </span>
      </div>
    </div>
  );
}
