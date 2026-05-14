"use client";

import { useSearchParams } from "next/navigation";
import { RightRailFiles } from "@/components/lenses/files/RightRailFiles";
import { RightRailSession } from "@/components/lenses/session/right-rail/RightRailSession";

/**
 * Right rail — lens-aware. Switches body based on URL searchParams:
 *
 *   ?file=<path>      → RightRailFiles (Outline + Backlinks)
 *   ?lens=agents      → empty (gallery is the whole surface in v1)
 *   else              → RightRailSession (In context · Memory · Recent ops)
 */
export function RightRail() {
  const params = useSearchParams();
  const file = params.get("file");
  const lens = params.get("lens");
  return (
    <aside
      aria-label="Right rail"
      className="overflow-y-auto border-l border-[color:var(--ag-border-subtle)]"
    >
      {file ? (
        <RightRailFiles path={file} />
      ) : lens === "agents" ? (
        <div className="px-3 py-4 font-mono text-[11px] opacity-50">—</div>
      ) : (
        <RightRailSession />
      )}
    </aside>
  );
}
