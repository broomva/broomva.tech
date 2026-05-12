"use client";

// Production empty state for the Spaces / Peers view. Wiring target:
// core/life/spaces (SpacetimeDB) — peer agents subscribed to the same
// broomva channel will appear here with latency + role + status.

export function Peers() {
  return (
    <div className="pane-empty">
      <div className="pane-empty__title">No peers in this space yet</div>
      <div className="pane-empty__body">
        When multiple agents join this project through Spaces, they'll appear
        here with live latency + role. Powered by SpacetimeDB.
      </div>
      <div className="pane-empty__meta">source · core/life/spaces</div>
    </div>
  );
}
