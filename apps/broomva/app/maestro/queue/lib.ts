import type { HandoffSummary } from "@/lib/db/handoff-queries";
import type { HandoffEventType, HandoffStatus } from "@/lib/db/schema";

/** Visual tone per queue status (mapped to Arcan Glass tokens in the client). */
export type QueueTone = "queued" | "active" | "done" | "muted" | "history";

/**
 * Display metadata per queue status. Keyed by the full enum so a missing case
 * is a compile error if the enum grows.
 */
export const HANDOFF_STATUS_META: Record<
  HandoffStatus,
  { label: string; tone: QueueTone }
> = {
  queued: { label: "Queued", tone: "queued" },
  in_progress: { label: "In progress", tone: "active" },
  done: { label: "Done", tone: "done" },
  archived: { label: "Archived", tone: "muted" },
  superseded: { label: "Superseded", tone: "history" },
};

/** Queue groups shown on the board, attention/flow order (next-up first). */
export const QUEUE_GROUP_ORDER: HandoffStatus[] = [
  "queued",
  "in_progress",
  "done",
  "archived",
];

export interface QueueGroup {
  status: HandoffStatus;
  label: string;
  tone: QueueTone;
  handoffs: HandoffSummary[];
}

/**
 * Group queue handoffs by status into the canonical flow order, dropping empty
 * groups. Pure — the single piece of board logic worth unit-testing. `done`
 * and `archived` are kept (they're the queue's recent history); `superseded`
 * never reaches the board (the query excludes it).
 */
export function groupQueue(handoffs: HandoffSummary[]): QueueGroup[] {
  return QUEUE_GROUP_ORDER.map((status) => ({
    status,
    label: HANDOFF_STATUS_META[status].label,
    tone: HANDOFF_STATUS_META[status].tone,
    handoffs: handoffs.filter((h) => h.status === status),
  })).filter((g) => g.handoffs.length > 0);
}

/** Per-status counts (active queue), flow-ordered, non-zero only — triage strip. */
export interface QueueSummaryItem {
  status: HandoffStatus;
  label: string;
  tone: QueueTone;
  count: number;
}

export function queueSummary(handoffs: HandoffSummary[]): QueueSummaryItem[] {
  return QUEUE_GROUP_ORDER.map((status) => ({
    status,
    label: HANDOFF_STATUS_META[status].label,
    tone: HANDOFF_STATUS_META[status].tone,
    count: handoffs.filter((h) => h.status === status).length,
  })).filter((s) => s.count > 0);
}

/** Count of handoffs waiting to be picked up — the queue's headline number. */
export function waitingCount(handoffs: HandoffSummary[]): number {
  return handoffs.filter((h) => h.status === "queued").length;
}

/** Default repo when a handoff records none (most arcs live in the workspace). */
const DEFAULT_REPO = "broomva/broomva.tech";

/** Fields the continue helpers read off a queue row. */
type ContinuableHandoff = Pick<
  HandoffSummary,
  | "slug"
  | "id"
  | "title"
  | "tldr"
  | "firstAction"
  | "specRefs"
  | "sourcePath"
  | "sourceRepo"
  | "branch"
  | "ticketId"
>;

/**
 * The seed prompt handed to a fresh session to CONTINUE a handoff (the Copy
 * button payload). When the handoff carries an explicit `firstAction` (the
 * "First action" the `/handoff` skill writes), that IS the payload — it's the
 * single concrete next step. Otherwise we synthesize an orienting prompt that
 * points at the handoff queue + the related specs (which have their own
 * `broomva docs get`). Pure — unit-tested.
 */
export function handoffContinuePrompt(h: ContinuableHandoff): string {
  const explicit = h.firstAction?.trim();
  if (explicit) return explicit;

  const lines = [`Continue the Broomva arc "${h.title}".`];
  if (h.tldr?.trim()) lines.push("", h.tldr.trim());
  lines.push("", "Open the handoff queue: https://broomva.tech/maestro/queue.");
  const refs = h.specRefs ?? [];
  if (refs.length > 0) {
    lines.push("", "Related specs:");
    for (const ref of refs) {
      lines.push(
        `- \`broomva docs get ${ref} -o ${ref}.html\` (or open https://broomva.tech/d/${ref})`,
      );
    }
  }
  if (h.sourcePath) {
    lines.push(
      "",
      `Source: \`${h.sourcePath}\`${h.sourceRepo ? ` in ${h.sourceRepo}` : ""}${
        h.branch ? ` (branch ${h.branch})` : ""
      }.`,
    );
  }
  if (h.ticketId) lines.push(`Linear ticket: ${h.ticketId}.`);
  lines.push(
    "",
    "Read the handoff and the specs it references, check the current state of the work, then continue under the workspace conventions (CLAUDE.md / AGENTS.md). Think through the dependency chain before editing.",
  );
  return lines.join("\n");
}

/**
 * A Claude Code deep link (`claude-cli://open`) that opens a session in the
 * arc's repo with the continue-prompt pre-filled (not auto-sent).
 */
export function handoffDeepLink(h: ContinuableHandoff): string {
  const repo = h.sourceRepo ?? DEFAULT_REPO;
  return `claude-cli://open?repo=${repo}&q=${encodeURIComponent(
    handoffContinuePrompt(h),
  )}`;
}

// ── Timeline (the realtime stream card) ──────────────────────────────────────

/** A timeline entry — the shape the SSE stream and the SSR feed both produce. */
export interface TimelineEvent {
  id: string;
  handoffId: string;
  type: HandoffEventType;
  actor: string;
  message: string | null;
  createdAt: string | Date;
}

/** Glyph + tone per event type for the timeline dots. */
export const EVENT_META: Record<
  HandoffEventType,
  { glyph: string; tone: QueueTone; verb: string }
> = {
  pushed: { glyph: "↑", tone: "queued", verb: "Queued" },
  picked_up: { glyph: "▶", tone: "active", verb: "Picked up" },
  completed: { glyph: "✓", tone: "done", verb: "Completed" },
  archived: { glyph: "⌅", tone: "muted", verb: "Archived" },
  restored: { glyph: "↺", tone: "queued", verb: "Re-queued" },
  superseded: { glyph: "⤳", tone: "history", verb: "Superseded" },
  linked: { glyph: "🔗", tone: "active", verb: "Linked spec" },
  note: { glyph: "•", tone: "muted", verb: "Note" },
};

/**
 * Merge a fresh batch of streamed events into the existing timeline: dedupe by
 * id, keep newest-first, cap length. Pure — the client's only state-merge logic,
 * so it's the piece worth unit-testing.
 */
export function mergeTimeline(
  current: TimelineEvent[],
  incoming: TimelineEvent[],
  cap = 80,
): TimelineEvent[] {
  const byId = new Map<string, TimelineEvent>();
  for (const e of [...incoming, ...current]) byId.set(e.id, e);
  return [...byId.values()]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, cap);
}

/** A compact relative-time label ("3m", "2h", "5d") for timeline + cards. */
export function relativeTime(
  value: string | Date,
  now: Date = new Date(),
): string {
  const then = new Date(value).getTime();
  const secs = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (secs < 45) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  return `${weeks}w`;
}
