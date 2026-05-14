"use client";

import { useSearchParams } from "next/navigation";
import { RightRailFiles } from "@/components/lenses/files/RightRailFiles";
import { RightRailSession } from "@/components/lenses/session/right-rail/RightRailSession";

/**
 * Right rail — lens-aware. When the URL carries `?file=<path>`, the Files
 * lens is active and we mount `RightRailFiles` (Outline + Backlinks).
 * Otherwise we fall back to `RightRailSession` (In context · Memory ·
 * Recent operations).
 */
export function RightRail() {
  const params = useSearchParams();
  const file = params.get("file");
  return (
    <aside
      aria-label="Right rail"
      className="overflow-y-auto border-l border-[color:var(--ag-border-subtle)]"
    >
      {file ? <RightRailFiles path={file} /> : <RightRailSession />}
    </aside>
  );
}
