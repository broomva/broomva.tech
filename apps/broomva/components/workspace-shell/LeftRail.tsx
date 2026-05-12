function RailHeading({
  children,
  count,
  action,
}: {
  children: string;
  count?: number;
  action?: string;
}) {
  return (
    <h6 className="mt-5 mb-2 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
      <span>{children}</span>
      <span className="flex gap-1">
        {count !== undefined && <span className="opacity-70">{count}</span>}
        {action && <span className="opacity-60">{action}</span>}
      </span>
    </h6>
  );
}

/**
 * Left rail — three sections: Sessions, Filesystem, Pinned.
 *
 * All sections are placeholders in v1. Real content lands in PR 4 (Session
 * lens populates Sessions), PR 5 (Files lens populates Filesystem), and a
 * later UX pass for Pinned (currently localStorage-only).
 */
export function LeftRail() {
  return (
    <aside
      aria-label="Left rail"
      className="overflow-y-auto border-r border-[color:var(--ag-border-subtle)] px-3 pb-3"
    >
      <RailHeading count={0} action="+ new">
        Sessions
      </RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        No sessions yet. Open one from the dock or press <kbd>⌘K</kbd>.
      </div>
      <button
        type="button"
        className="ag-glass-subtle mt-1 w-full rounded px-1 py-1.5 text-left font-mono text-[11px] opacity-70 hover:opacity-100"
      >
        + new session
      </button>

      <RailHeading action="⌘O">Filesystem</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">Empty.</div>

      <RailHeading>Pinned</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        No pinned items.
      </div>
    </aside>
  );
}
