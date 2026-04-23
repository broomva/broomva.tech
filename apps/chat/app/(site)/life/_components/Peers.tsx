"use client";

import { LIFE_PEERS } from "../_lib/mock-workspace";

export function Peers() {
  return (
    <div className="peers" style={{ position: "relative" }}>
      <span
        className="pill"
        style={{
          position: "absolute",
          top: 10,
          right: 14,
          zIndex: 2,
          fontSize: 9.5,
          letterSpacing: "0.14em",
        }}
      >
        demo · needs SpacetimeDB
      </span>
      {LIFE_PEERS.map((p) => (
        <div key={p.name} className="peer-card">
          <div className="peer-card__head">
            <div
              className="peer-avatar"
              style={{ ["--h" as string]: p.hue } as React.CSSProperties}
            />
            <div>
              <div className="peer-card__name">{p.name}</div>
              <div className="peer-card__role">{p.role}</div>
            </div>
          </div>
          <div className="peer-card__status">{p.status}</div>
          <div className="peer-card__latency">{p.lat}ms</div>
        </div>
      ))}
    </div>
  );
}
