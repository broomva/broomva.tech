function RailHeading({ children }: { children: string }) {
  return (
    <h6 className="mt-5 mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
      {children}
    </h6>
  );
}

/**
 * Right rail — context-aware. In the Session lens it shows In-context cards,
 * a this-session memory mini-graph, and a live Recent operations feed. In v1
 * all three sections are placeholders; data binding happens in PR 4.
 */
export function RightRail() {
  return (
    <aside
      aria-label="Right rail"
      className="overflow-y-auto border-l border-[color:var(--ag-border-subtle)] px-3 pb-3"
    >
      <RailHeading>In context</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        Start a session to populate context.
      </div>

      <RailHeading>Memory · this session</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>

      <RailHeading>Recent operations</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>
    </aside>
  );
}
