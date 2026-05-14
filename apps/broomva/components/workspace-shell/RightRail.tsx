import { RightRailSession } from "@/components/lenses/session/right-rail/RightRailSession";

/**
 * Right rail — context-aware. In v1, only the Session lens has right-rail
 * content (three panels: In context, Memory mini-graph, Recent operations).
 * Other lenses (Files, Agents) will mount their own rail composition when
 * they ship.
 */
export function RightRail() {
  return (
    <aside
      aria-label="Right rail"
      className="overflow-y-auto border-l border-[color:var(--ag-border-subtle)]"
    >
      <RightRailSession />
    </aside>
  );
}
