import type { SpecDocOrchState } from "@/lib/db/schema";
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";

/** The content-states the Maestro board groups by (mirrors BOARD_STATES). */
export type BoardState = "published" | "draft" | "archived";

/** Visual tone per orch-state (mapped to Arcan Glass tokens in the client). */
export type OrchTone =
  | "muted"
  | "active"
  | "warn"
  | "review"
  | "done"
  | "canceled";

/**
 * Display metadata for the orchestration plane (BRO-1336). Keyed by the full
 * orch-state enum, so a missing case is a compile error if the enum grows.
 * Phase 0b surfaces the state (read-only); Trigger actions land in Phase 1.
 */
export const ORCH_STATE_META: Record<
  SpecDocOrchState,
  { label: string; tone: OrchTone }
> = {
  proposed: { label: "Proposed", tone: "muted" },
  reviewing: { label: "Reviewing", tone: "muted" },
  triggered: { label: "Triggered", tone: "active" },
  running: { label: "Running", tone: "active" },
  blocked: { label: "Blocked", tone: "warn" },
  review: { label: "Review", tone: "review" },
  done: { label: "Done", tone: "done" },
  canceled: { label: "Canceled", tone: "canceled" },
};

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

/** Fields the continue-session helpers read off a board doc. */
type ContinuableDoc = Pick<
  SpecDocSummary,
  "handle" | "id" | "title" | "sourcePath" | "sourceRepo" | "ticketId"
>;

/** Default repo when a spec has no recorded sourceRepo (most specs live here). */
const DEFAULT_REPO = "broomva/broomva.tech";

/**
 * The seed prompt handed to a fresh agent session to CONTINUE a spec (BRO-1399).
 * Leans on the BRO-1335 content-GET keystone (`broomva docs get <handle>`) so the
 * agent pulls the exact spec body, then reads the referenced source and continues
 * under the workspace conventions. Pure — unit-tested.
 */
export function continuePrompt(doc: ContinuableDoc): string {
  const handle = doc.handle ?? doc.id;
  const lines = [
    `Continue work on the Broomva spec "${doc.title}".`,
    "",
    `Pull the full spec: \`broomva docs get ${handle} -o spec.html\` (or open https://broomva.tech/d/${handle}).`,
  ];
  if (doc.sourcePath) {
    lines.push(
      `Spec source: \`${doc.sourcePath}\`${doc.sourceRepo ? ` in ${doc.sourceRepo}` : ""}.`,
    );
  }
  if (doc.ticketId) {
    lines.push(`Linear ticket: ${doc.ticketId}.`);
  }
  lines.push(
    "",
    "Read the spec and the files it references, check the current state of the work, then continue the implementation under the workspace conventions (CLAUDE.md / AGENTS.md). Think through the dependency chain before editing.",
  );
  return lines.join("\n");
}

/**
 * A Claude Code deep link (`claude-cli://open`, v2.1.91+) that opens a session in
 * the spec's repo with the continue-prompt pre-filled (not auto-sent). `repo`
 * resolves to a local clone Claude Code has already seen. Omnara has no public
 * prompt-carrying deep link, so its path is `continuePrompt` + clipboard paste.
 */
export function claudeDeepLink(doc: ContinuableDoc): string {
  const repo = doc.sourceRepo ?? DEFAULT_REPO;
  return `claude-cli://open?repo=${repo}&q=${encodeURIComponent(continuePrompt(doc))}`;
}

// ── Mission-control view (BRO-1402): group by ORCH-state, attention-first ─────

/** Attention-first order for the orchestration view (needs-you → active → backlog → terminal). */
export const ORCH_GROUP_ORDER: SpecDocOrchState[] = [
  "blocked",
  "review",
  "running",
  "triggered",
  "reviewing",
  "proposed",
  "done",
  "canceled",
];

/** Orch-states that need the human (surfaced first; drive the "needs attention" headline). */
export const ATTENTION_STATES: SpecDocOrchState[] = ["blocked", "review"];

/** Active (non-archived) docs — the ones in the orchestration flow. */
function activeDocs(docs: SpecDocSummary[]): SpecDocSummary[] {
  return docs.filter((d) => d.state === "published" || d.state === "draft");
}

export interface OrchGroup {
  state: SpecDocOrchState;
  label: string;
  tone: OrchTone;
  docs: SpecDocSummary[];
}

/**
 * Group ACTIVE docs by orch-state, attention-first (ORCH_GROUP_ORDER), dropping
 * empty groups. Archived docs are excluded (a manage concern — see archivedDocs).
 */
export function groupByOrchState(docs: SpecDocSummary[]): OrchGroup[] {
  const active = activeDocs(docs);
  return ORCH_GROUP_ORDER.map((state) => ({
    state,
    label: ORCH_STATE_META[state].label,
    tone: ORCH_STATE_META[state].tone,
    docs: active.filter((d) => d.orchState === state),
  })).filter((g) => g.docs.length > 0);
}

export interface OrchSummaryItem {
  state: SpecDocOrchState;
  label: string;
  tone: OrchTone;
  count: number;
}

/** Per-orch-state counts (active docs), attention-ordered, non-zero only — the triage strip. */
export function orchSummary(docs: SpecDocSummary[]): OrchSummaryItem[] {
  const active = activeDocs(docs);
  return ORCH_GROUP_ORDER.map((state) => ({
    state,
    label: ORCH_STATE_META[state].label,
    tone: ORCH_STATE_META[state].tone,
    count: active.filter((d) => d.orchState === state).length,
  })).filter((s) => s.count > 0);
}

/** Count of active docs needing the human (blocked + review) — the headline. */
export function attentionCount(docs: SpecDocSummary[]): number {
  return activeDocs(docs).filter((d) => ATTENTION_STATES.includes(d.orchState))
    .length;
}

/** Total active (non-archived) docs. */
export function activeCount(docs: SpecDocSummary[]): number {
  return activeDocs(docs).length;
}

/** Archived docs (the collapsed manage section, off the control view). */
export function archivedDocs(docs: SpecDocSummary[]): SpecDocSummary[] {
  return docs.filter((d) => d.state === "archived");
}
