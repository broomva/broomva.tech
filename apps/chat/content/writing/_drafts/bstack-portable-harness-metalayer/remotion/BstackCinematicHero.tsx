import React, { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
  spring,
  useVideoConfig,
} from "remotion";

/**
 * Cinematic hero loop for bstack-portable-harness-metalayer post.
 *
 * 8 seconds at 30fps = 240 frames. Loops seamlessly: starts in deep black,
 * particles emerge, form a graph constellation, pulse cascades, wordmark
 * fades in, then everything dims back to deep black for a clean loop.
 *
 * Cinemascope 2.35:1 letterbox bars, deep-blue tint, amber accent on the
 * pulse + wordmark. Subtle parallax and film-grain via noise pattern.
 */

// Deterministic pseudo-random for reproducible particle positions.
const pseudoRand = (seed: number, i: number): number => {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280;
  return x - Math.floor(x);
};

// 28 particle nodes arranged in a constellation that suggests a graph.
// Hand-tuned positions for a balanced composition (centered near rule-of-thirds).
const NODES: Array<{ x: number; y: number; size: number; layer: number }> = [
  // Inner cluster (the "core" — primitives)
  { x: 0.50, y: 0.50, size: 1.4, layer: 0 },
  { x: 0.43, y: 0.42, size: 0.9, layer: 1 },
  { x: 0.57, y: 0.42, size: 0.9, layer: 1 },
  { x: 0.41, y: 0.55, size: 0.9, layer: 1 },
  { x: 0.59, y: 0.55, size: 0.9, layer: 1 },
  { x: 0.50, y: 0.38, size: 0.85, layer: 1 },
  { x: 0.50, y: 0.62, size: 0.85, layer: 1 },
  // Mid ring
  { x: 0.34, y: 0.34, size: 0.7, layer: 2 },
  { x: 0.66, y: 0.34, size: 0.7, layer: 2 },
  { x: 0.32, y: 0.50, size: 0.7, layer: 2 },
  { x: 0.68, y: 0.50, size: 0.7, layer: 2 },
  { x: 0.34, y: 0.66, size: 0.7, layer: 2 },
  { x: 0.66, y: 0.66, size: 0.7, layer: 2 },
  { x: 0.50, y: 0.28, size: 0.65, layer: 2 },
  { x: 0.50, y: 0.72, size: 0.65, layer: 2 },
  // Outer scatter (atmospheric — these create the field feel)
  { x: 0.18, y: 0.22, size: 0.5, layer: 3 },
  { x: 0.82, y: 0.22, size: 0.5, layer: 3 },
  { x: 0.18, y: 0.78, size: 0.5, layer: 3 },
  { x: 0.82, y: 0.78, size: 0.5, layer: 3 },
  { x: 0.10, y: 0.50, size: 0.45, layer: 3 },
  { x: 0.90, y: 0.50, size: 0.45, layer: 3 },
  { x: 0.25, y: 0.42, size: 0.4, layer: 3 },
  { x: 0.75, y: 0.42, size: 0.4, layer: 3 },
  { x: 0.25, y: 0.58, size: 0.4, layer: 3 },
  { x: 0.75, y: 0.58, size: 0.4, layer: 3 },
  { x: 0.50, y: 0.15, size: 0.4, layer: 3 },
  { x: 0.50, y: 0.85, size: 0.4, layer: 3 },
  { x: 0.50, y: 0.92, size: 0.35, layer: 3 },
];

// Connections — drawn between layer-0 / layer-1 / layer-2 nodes only.
// Each connection has a "phase" that controls when the pulse hits it.
const CONNECTIONS: Array<{ a: number; b: number; phase: number }> = [
  // Core to inner ring
  { a: 0, b: 1, phase: 0.0 },
  { a: 0, b: 2, phase: 0.05 },
  { a: 0, b: 3, phase: 0.1 },
  { a: 0, b: 4, phase: 0.15 },
  { a: 0, b: 5, phase: 0.2 },
  { a: 0, b: 6, phase: 0.25 },
  // Inner ring web
  { a: 1, b: 5, phase: 0.3 },
  { a: 2, b: 5, phase: 0.32 },
  { a: 3, b: 6, phase: 0.34 },
  { a: 4, b: 6, phase: 0.36 },
  { a: 1, b: 3, phase: 0.4 },
  { a: 2, b: 4, phase: 0.42 },
  // Inner to mid
  { a: 1, b: 7, phase: 0.5 },
  { a: 2, b: 8, phase: 0.52 },
  { a: 3, b: 11, phase: 0.54 },
  { a: 4, b: 12, phase: 0.56 },
  { a: 5, b: 13, phase: 0.58 },
  { a: 6, b: 14, phase: 0.6 },
  { a: 1, b: 9, phase: 0.62 },
  { a: 2, b: 10, phase: 0.64 },
  // Mid ring scatter
  { a: 7, b: 9, phase: 0.7 },
  { a: 8, b: 10, phase: 0.72 },
  { a: 11, b: 9, phase: 0.74 },
  { a: 12, b: 10, phase: 0.76 },
  { a: 13, b: 7, phase: 0.78 },
  { a: 13, b: 8, phase: 0.8 },
];

const COLORS = {
  bg: "#0a0e1a",
  bgDeep: "#04060d",
  accent: "#f5a623",
  accentSoft: "#ffd089",
  node: "#9bb4d4",
  nodeBright: "#dde9ff",
  connection: "rgba(155, 180, 212, 0.18)",
  connectionPulse: "rgba(245, 166, 35, 0.95)",
};

export const BstackCinematicHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames, fps } = useVideoConfig();

  // Loop-friendly progress: 0 → 1 across the whole composition.
  const t = frame / durationInFrames;

  // Phase windows (each in [0, 1] within the loop):
  //   0.00–0.10   pure black, single seed point intensifying
  //   0.10–0.30   particles fade in with parallax drift
  //   0.30–0.55   connections draw + pulse cascades
  //   0.45–0.75   wordmark fades in (overlaps the pulse for cinematic flow)
  //   0.75–0.95   hold steady
  //   0.95–1.00   dim back to black for clean loop

  // Camera drift — parallax illusion via slow translate + scale.
  const driftX = Math.sin(t * Math.PI * 2) * 12;
  const driftY = Math.cos(t * Math.PI * 2) * 8;
  const cameraScale = 1.04 + Math.sin(t * Math.PI * 2) * 0.015;

  // Vignette intensity — pulls in slightly during the wordmark hold.
  const vignette = interpolate(
    t,
    [0, 0.4, 0.7, 1.0],
    [0.95, 0.85, 0.75, 0.95],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Seed-point intensity at center — bright at loop boundary, dim during hold.
  const seedGlow = interpolate(
    t,
    [0, 0.08, 0.92, 1.0],
    [0.9, 0.3, 0.4, 0.9],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Particle field emergence (0.10 → 0.30) and dim (0.92 → 1.0).
  const particleOpacity = interpolate(
    t,
    [0.08, 0.30, 0.92, 1.0],
    [0.0, 1.0, 1.0, 0.0],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Connections appearance (0.25 → 0.45).
  const connectionFade = interpolate(
    t,
    [0.22, 0.45, 0.92, 1.0],
    [0.0, 1.0, 1.0, 0.0],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Pulse position along its sweep (0.30 → 0.65).
  const pulseProgress = interpolate(
    t,
    [0.30, 0.65],
    [0.0, 1.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const pulseAlive = t >= 0.28 && t <= 0.72;

  // Wordmark fade — blur-clearing reveal.
  const wordOpacity = interpolate(
    t,
    [0.45, 0.60, 0.85, 0.95],
    [0, 1, 1, 0],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );
  const wordBlur = interpolate(
    t,
    [0.45, 0.60, 0.85, 0.95],
    [16, 0, 0, 8],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );
  const wordTranslateY = interpolate(
    t,
    [0.45, 0.60],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) },
  );

  // Subtitle fade.
  const subOpacity = interpolate(
    t,
    [0.55, 0.70, 0.85, 0.93],
    [0, 0.85, 0.85, 0],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Cinemascope letterbox — 2.35:1 within a 1.78:1 (16:9) frame
  // means top/bottom bars of (1080 - 1080*16/9*9/(2.35*16)) ≈ 137px each.
  // Practically: bars are 12% of height each. Animate them in slightly.
  const barHeight = interpolate(
    t,
    [0, 0.05, 0.95, 1.0],
    [0.18, 0.12, 0.12, 0.18],
    { easing: Easing.bezier(0.4, 0, 0.2, 1) },
  );

  // Per-node twinkle — subtle individual variations.
  const nodes = useMemo(() => NODES.map((n, i) => ({ ...n, twinkleSeed: pseudoRand(i, 7) })), []);

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeep, overflow: "hidden" }}>
      {/* Deep gradient background — radial, simulating volumetric atmosphere. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${COLORS.bg} 0%, ${COLORS.bgDeep} 70%, #000 100%)`,
        }}
      />

      {/* Camera-drift wrapper for everything constellation-related */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${driftX}px, ${driftY}px) scale(${cameraScale})`,
          transformOrigin: "center center",
        }}
      >
        {/* Seed point at center — anchor of the loop */}
        <div
          style={{
            position: "absolute",
            left: width * 0.5 - 6,
            top: height * 0.5 - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: COLORS.accentSoft,
            opacity: seedGlow,
            boxShadow: `0 0 ${40 * seedGlow}px ${20 * seedGlow}px rgba(245, 166, 35, ${0.6 * seedGlow})`,
            filter: `blur(${(1 - seedGlow) * 2}px)`,
          }}
        />

        {/* SVG layer for connections (drawn beneath nodes) */}
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, opacity: connectionFade }}
        >
          {CONNECTIONS.map((c, i) => {
            const a = nodes[c.a];
            const b = nodes[c.b];
            const x1 = a.x * width;
            const y1 = a.y * height;
            const x2 = b.x * width;
            const y2 = b.y * height;
            // Pulse intensity for this connection — narrow gaussian centered at its phase.
            const dist = Math.abs(pulseProgress - c.phase);
            const intensity = pulseAlive
              ? Math.max(0, 1 - dist * 4) // narrow window so the pulse "travels"
              : 0;
            return (
              <g key={i}>
                {/* Base line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={COLORS.connection}
                  strokeWidth={1}
                />
                {/* Pulse line — overlay that lights up briefly */}
                {intensity > 0.01 && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={COLORS.connectionPulse}
                    strokeWidth={1.5}
                    opacity={intensity}
                    style={{
                      filter: `drop-shadow(0 0 ${4 * intensity}px ${COLORS.accent})`,
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Node particles */}
        {nodes.map((n, i) => {
          // Each node has staggered fade-in based on layer (inner first).
          const layerStagger = n.layer * 0.03;
          const nodeOpacity = interpolate(
            t,
            [0.08 + layerStagger, 0.30 + layerStagger, 0.92, 1.0],
            [0, particleOpacity, particleOpacity, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const twinkle = 0.85 + Math.sin(t * Math.PI * 2 * 1.5 + n.twinkleSeed * 6.28) * 0.15;

          // If a connection that touches this node is currently being pulsed, brighten it.
          const isPulseHit = pulseAlive && CONNECTIONS.some((c) => {
            if (c.a !== i && c.b !== i) return false;
            const dist = Math.abs(pulseProgress - c.phase);
            return dist < 0.05;
          });
          const baseSize = n.size * 6;
          const size = isPulseHit ? baseSize * 1.6 : baseSize;
          const color = isPulseHit ? COLORS.accent : COLORS.node;
          const glow = isPulseHit ? 24 : n.layer === 0 ? 16 : 8;
          const glowColor = isPulseHit
            ? "rgba(245, 166, 35, 0.8)"
            : "rgba(155, 180, 212, 0.4)";
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: n.x * width - size / 2,
                top: n.y * height - size / 2,
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
                opacity: nodeOpacity * twinkle,
                boxShadow: `0 0 ${glow}px ${glow / 2}px ${glowColor}`,
                transition: "none",
              }}
            />
          );
        })}
      </div>

      {/* Wordmark layer — front-of-camera, no parallax */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            opacity: wordOpacity,
            transform: `translateY(${wordTranslateY}px)`,
            filter: `blur(${wordBlur}px)`,
            color: COLORS.nodeBright,
            fontSize: 180,
            fontWeight: 200,
            letterSpacing: "-0.04em",
            fontFamily:
              "ui-serif, 'Iowan Old Style', 'Apple Garamond', Georgia, serif",
            textShadow:
              "0 0 60px rgba(245, 166, 35, 0.35), 0 0 24px rgba(0, 0, 0, 0.5)",
          }}
        >
          bstack
        </div>
        <div
          style={{
            opacity: subOpacity,
            color: COLORS.accentSoft,
            fontSize: 28,
            fontWeight: 400,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            fontFamily:
              "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
            marginTop: 28,
            textShadow: "0 0 24px rgba(245, 166, 35, 0.4)",
          }}
        >
          the body around the brain
        </div>
      </div>

      {/* Vignette — dark edges */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(0,0,0,${vignette}) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Cinemascope letterbox bars */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: height * barHeight,
          background: "#000",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: height * barHeight,
          background: "#000",
          pointerEvents: "none",
        }}
      />

      {/* Film grain overlay — subtle noise via repeating SVG pattern */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: "overlay",
          opacity: 0.06,
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed={Math.floor(frame / 3)}
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0"
            />
          </filter>
        </defs>
        <rect width={width} height={height} filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
