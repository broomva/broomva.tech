"use client";

import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
  lastOpTs: number;
}

const MODULES = [
  { id: "arcan", x: 0.28, y: 0.45, label: "arcan", color: "oklch(0.60 0.12 260)" },
  { id: "lago", x: 0.7, y: 0.32, label: "lago", color: "oklch(0.78 0.15 155)" },
  {
    id: "autonomic",
    x: 0.78,
    y: 0.72,
    label: "autonomic",
    color: "oklch(0.65 0.14 235)",
  },
  { id: "anima", x: 0.18, y: 0.75, label: "anima", color: "oklch(0.70 0.15 300)" },
  { id: "nous", x: 0.48, y: 0.18, label: "nous", color: "oklch(0.87 0.18 85)" },
] as const;

const W = 900;
const H = 480;

export function Constellation({ state, lastOpTs }: Props) {
  const ops = state.fsOps.slice(-16);
  const lastOp = ops[ops.length - 1];
  const opPos = ops.map((o, i) => {
    const mod = MODULES.find((m) => o.path.includes(m.id)) ?? MODULES[0];
    const ang = (i * 0.87 + 0.2) % (Math.PI * 2);
    const rad = 60 + (i % 3) * 22;
    return {
      o,
      mod,
      x: mod.x * W + Math.cos(ang) * rad,
      y: mod.y * H + Math.sin(ang) * rad,
      fresh: o === lastOp && Date.now() - lastOpTs < 1500,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "100%" }}
      preserveAspectRatio="xMidYMid slice"
    >
      <title>Filesystem constellation</title>
      <defs>
        <radialGradient id="modGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="oklch(0.60 0.12 260 / 0.45)" />
          <stop offset="100%" stopColor="oklch(0.60 0.12 260 / 0)" />
        </radialGradient>
      </defs>
      {MODULES.map((m) => (
        <circle
          key={`orb-${m.id}`}
          cx={m.x * W}
          cy={m.y * H}
          r="90"
          fill="none"
          stroke="oklch(0.40 0.02 275 / 0.2)"
          strokeDasharray="2 6"
        />
      ))}
      {MODULES.map((m, i) =>
        MODULES.slice(i + 1).map((n) => (
          <line
            key={`link-${m.id}-${n.id}`}
            x1={m.x * W}
            y1={m.y * H}
            x2={n.x * W}
            y2={n.y * H}
            stroke="oklch(0.40 0.02 275 / 0.15)"
            strokeWidth="1"
          />
        )),
      )}
      {MODULES.map((m) => (
        <g key={m.id} transform={`translate(${m.x * W} ${m.y * H})`}>
          <circle r="38" fill="url(#modGlow)" />
          <circle
            r="18"
            fill="oklch(0.17 0.03 275)"
            stroke={m.color}
            strokeWidth="1.5"
            style={{ filter: `drop-shadow(0 0 6px ${m.color})` }}
          />
          <text
            y="4"
            textAnchor="middle"
            fill="oklch(0.98 0 0)"
            fontFamily="var(--ag-font-heading)"
            fontSize="12"
          >
            {m.label}
          </text>
        </g>
      ))}
      {opPos.map((p) => (
        <g key={p.o.id}>
          <line
            x1={p.mod.x * W}
            y1={p.mod.y * H}
            x2={p.x}
            y2={p.y}
            stroke={p.fresh ? p.mod.color : "oklch(0.40 0.02 275 / 0.35)"}
            strokeWidth={p.fresh ? 1.5 : 0.8}
          />
          <circle
            cx={p.x}
            cy={p.y}
            r={p.fresh ? 8 : 4}
            fill={
              p.o.op === "read"
                ? "oklch(0.26 0.03 275)"
                : p.o.op === "create"
                  ? "oklch(0.78 0.15 155)"
                  : p.mod.color
            }
            stroke={p.mod.color}
            strokeWidth="1"
            style={
              p.fresh
                ? { filter: `drop-shadow(0 0 8px ${p.mod.color})` }
                : undefined
            }
          />
          {p.fresh && (
            <text
              x={p.x + 10}
              y={p.y + 3}
              fontFamily="var(--ag-font-mono)"
              fontSize="9.5"
              fill="oklch(0.98 0 0)"
            >
              {p.o.path.split("/").pop()}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
