"use client";

// Production empty state — the Lago-backed knowledge graph view will hydrate
// here when the Rust service is wired up. Until then we show an explanatory
// empty state so operators aren't looking at a fake graph.
//
// Wiring target: core/life/lago — read entities + edges as a subgraph of the
// current session's knowledge context, then render with the same layout.

export function KnowledgeGraph() {
  return (
    <div className="pane-empty">
      <div className="pane-empty__title">Knowledge graph</div>
      <div className="pane-empty__body">
        Session-scoped entity + concept subgraph, rendered from Lago. Coming
        once the <code>lago</code> service is deployed for /life sessions.
      </div>
      <div className="pane-empty__meta">source · core/life/lago</div>
    </div>
  );
}
