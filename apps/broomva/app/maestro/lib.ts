import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";

/** The content-states the Maestro board groups by (mirrors BOARD_STATES). */
export type BoardState = "published" | "draft" | "archived";

/** Canonical display order of the board groups. */
export const BOARD_GROUP_ORDER: BoardState[] = [
  "published",
  "draft",
  "archived",
];

export const BOARD_GROUP_META: Record<
  BoardState,
  { label: string; hint: string }
> = {
  published: { label: "Published", hint: "Live at /d/<handle>" },
  draft: { label: "Draft", hint: "Work in progress" },
  archived: {
    label: "Archived",
    hint: "Hidden from /d — restore to republish",
  },
};

export interface BoardGroup {
  state: BoardState;
  label: string;
  hint: string;
  docs: SpecDocSummary[];
}

/**
 * Group board docs by content-state into the canonical display order, dropping
 * empty groups. Pure — the single piece of board logic worth unit-testing; the
 * upstream query already restricts to BOARD_STATES, but this also drops any
 * unexpected state (defense in depth) so the board never renders a stray group.
 */
export function groupBoardSpecs(docs: SpecDocSummary[]): BoardGroup[] {
  return BOARD_GROUP_ORDER.map((state) => ({
    state,
    label: BOARD_GROUP_META[state].label,
    hint: BOARD_GROUP_META[state].hint,
    docs: docs.filter((d) => d.state === state),
  })).filter((g) => g.docs.length > 0);
}

/**
 * The viewer URL for a board row. The bare `/d/<handle>` route serves only
 * ACTIVE_STATES (published/draft), so an archived doc must link to its
 * version-pin route `/d/<handle>/v/<n>` (which serves any non-deleted version)
 * — otherwise the link dead-ends at 404. Keeps the archive round-trip navigable.
 */
export function viewerHref(
  doc: Pick<SpecDocSummary, "handle" | "id" | "state" | "version">,
): string {
  const ref = doc.handle ?? doc.id;
  return doc.state === "archived" ? `/d/${ref}/v/${doc.version}` : `/d/${ref}`;
}
