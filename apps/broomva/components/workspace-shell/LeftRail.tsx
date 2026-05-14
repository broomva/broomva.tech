import Link from "next/link";
import { FilesTree } from "@/components/lenses/files/FilesTree";
import { SessionsList } from "@/components/workspace-shell/SessionsList";

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
 * Sessions (Plan D) pulls from /api/me/sessions via SessionsList — the
 * logged-in user's recently-touched session ids, most recent first.
 * Filesystem (Plan B-5) renders a tree of fs.write events from the
 * scene. Pinned remains a placeholder for v1.1.
 */
export function LeftRail() {
  return (
    <aside
      aria-label="Left rail"
      className="overflow-y-auto border-r border-[color:var(--ag-border-subtle)] px-3 pb-3"
    >
      <RailHeading action="+ new">Sessions</RailHeading>
      <SessionsList />
      <Link
        href="/workspace"
        className="ag-glass-subtle mt-1 block w-full rounded px-1 py-1.5 text-left font-mono text-[11px] opacity-70 hover:opacity-100"
      >
        ← my workspace
      </Link>

      <RailHeading action="⌘O">Filesystem</RailHeading>
      <FilesTree />

      <RailHeading>Pinned</RailHeading>
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        No pinned items.
      </div>
    </aside>
  );
}
