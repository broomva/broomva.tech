"use client";

import { ChevronDown, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HandoffSummary } from "@/lib/db/handoff-queries";
import type { HandoffStatus } from "@/lib/db/schema";
import {
  groupQueue,
  handoffContinuePrompt,
  handoffDeepLink,
  type QueueTone,
  queueSummary,
  waitingCount,
} from "./lib";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const TONE_CLASS: Record<QueueTone, string> = {
  queued:
    "border-[color:var(--ag-accent-blue)]/40 text-[color:var(--ag-accent-blue)]",
  active: "border-[color:var(--ag-ai-blue)]/40 text-[color:var(--ag-ai-blue)]",
  done: "border-[color:var(--ag-success)]/40 text-[color:var(--ag-success)]",
  muted: "border-muted-foreground/30 text-muted-foreground",
  history: "border-[color:var(--ag-error)]/40 text-[color:var(--ag-error)]",
};

const SECONDARY_BTN =
  "rounded-md px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";
const PRIMARY_BTN =
  "rounded-md border border-[color:var(--ag-ai-blue)]/40 px-2.5 py-1 text-[color:var(--ag-ai-blue)] text-xs transition-colors hover:bg-[color:var(--ag-ai-blue)]/10 disabled:opacity-50";
const CARD =
  "rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-3 transition-colors hover:border-[color:var(--ag-ai-blue)]/30";

function chipClass(selected: boolean, tone?: QueueTone): string {
  const base = "rounded-full border px-2.5 py-1 text-xs transition-colors";
  if (selected) {
    return `${base} border-[color:var(--ag-ai-blue)]/50 bg-[color:var(--ag-ai-blue)]/10 text-foreground`;
  }
  return `${base} ${
    tone ? TONE_CLASS[tone] : "border-border/60 text-muted-foreground"
  } hover:bg-muted/50`;
}

/**
 * The handoff queue board (BRO-1415). Grouped by status, flow-ordered
 * (Queued → In progress → Done → Archived) with a triage header + filter strip.
 * Each card relates to its specs (chips → /d/<handle>), runs via Copy
 * (continue-prompt → clipboard) / Continue (claude-cli:// deep link), and
 * transitions via the owner-scoped PATCH/DELETE endpoints. The full markdown
 * body lazy-loads on expand.
 */
export function QueueBoard({ handoffs }: { handoffs: HandoffSummary[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPublicId, setCopiedPublicId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HandoffStatus | null>(null);

  const groups = groupQueue(handoffs);
  const summary = queueSummary(handoffs);
  const waiting = waitingCount(handoffs);

  async function mutate(id: string, init: RequestInit) {
    setPendingId(id);
    setError(null);
    try {
      const resp = await fetch(`/api/handoffs/${id}`, init);
      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Action failed (${resp.status})`);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — please retry.");
    } finally {
      setPendingId(null);
      setConfirmId(null);
    }
  }

  async function share(h: HandoffSummary, action: "share" | "unshare") {
    setPendingId(h.id);
    setError(null);
    try {
      const resp = await fetch(`/api/handoffs/${h.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await resp.json().catch(() => null)) as {
        error?: string;
        publicUrl?: string | null;
      } | null;
      if (!resp.ok) {
        setError(body?.error ?? `Action failed (${resp.status})`);
        return;
      }
      if (action === "share" && body?.publicUrl) {
        await navigator.clipboard.writeText(body.publicUrl);
        setCopiedPublicId(h.id);
        setTimeout(
          () => setCopiedPublicId((cur) => (cur === h.id ? null : cur)),
          1500,
        );
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — please retry.");
    } finally {
      setPendingId(null);
    }
  }

  function action(
    a: "pick_up" | "complete" | "archive" | "requeue",
  ): RequestInit {
    return {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: a }),
    };
  }

  async function copyPrompt(h: HandoffSummary) {
    try {
      await navigator.clipboard.writeText(handoffContinuePrompt(h));
      setCopiedId(h.id);
      setTimeout(() => setCopiedId((cur) => (cur === h.id ? null : cur)), 1500);
    } catch {
      setError("Clipboard unavailable — open the handoff and copy manually.");
    }
  }

  async function copyPublicLink(h: HandoffSummary) {
    await navigator.clipboard.writeText(`${window.location.origin}/h/${h.id}`);
    setCopiedPublicId(h.id);
    setTimeout(
      () => setCopiedPublicId((cur) => (cur === h.id ? null : cur)),
      1500,
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        Queue is empty. Push a handoff with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          broomva handoff push docs/handoffs/&lt;arc&gt;.md
        </code>
        .
      </div>
    );
  }

  const visibleGroups = filter
    ? groups.filter((g) => g.status === filter)
    : groups;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {error}
        </div>
      ) : null}

      {/* Triage header */}
      <div className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {waiting > 0 ? (
            <span className="font-medium text-[color:var(--ag-accent-blue)] text-sm">
              {waiting} {waiting === 1 ? "handoff" : "handoffs"} waiting to pick
              up
            </span>
          ) : (
            <span className="font-medium text-[color:var(--ag-success)] text-sm">
              Queue clear
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            · {handoffs.length} total
          </span>
        </div>
        {summary.length > 1 || filter ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={chipClass(filter === null)}
            >
              All
            </button>
            {summary.map((s) => (
              <button
                key={s.status}
                type="button"
                onClick={() => setFilter(filter === s.status ? null : s.status)}
                className={chipClass(filter === s.status, s.tone)}
              >
                {s.label} <span className="opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visibleGroups.map((group) => (
        <section key={group.status}>
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${TONE_CLASS[group.tone]}`}
            >
              {group.label}
            </span>
            <span className="text-muted-foreground text-xs">
              {group.handoffs.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {group.handoffs.map((h) => (
              <HandoffCard
                key={h.id}
                h={h}
                busy={pendingId === h.id}
                confirming={confirmId === h.id}
                copied={copiedId === h.id}
                copiedPublic={copiedPublicId === h.id}
                onCopy={() => copyPrompt(h)}
                onCopyPublic={() => copyPublicLink(h)}
                onShare={(a) => share(h, a)}
                onAction={(a) => mutate(h.id, action(a))}
                onConfirmDelete={() => setConfirmId(h.id)}
                onCancelDelete={() => setConfirmId(null)}
                onDelete={() => mutate(h.id, { method: "DELETE" })}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HandoffCard({
  h,
  busy,
  confirming,
  copied,
  copiedPublic,
  onCopy,
  onCopyPublic,
  onShare,
  onAction,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: {
  h: HandoffSummary;
  busy: boolean;
  confirming: boolean;
  copied: boolean;
  copiedPublic: boolean;
  onCopy: () => void;
  onCopyPublic: () => void;
  onShare: (a: "share" | "unshare") => void;
  onAction: (a: "pick_up" | "complete" | "archive" | "requeue") => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [bodyError, setBodyError] = useState(false);
  const specRefs = h.specRefs ?? [];

  async function toggleBody() {
    const next = !expanded;
    setExpanded(next);
    // Fetch when expanding and not yet loaded. On error we leave `body` null so
    // collapsing + re-expanding retries (rather than caching the error string).
    if (next && body === null && !loadingBody) {
      setLoadingBody(true);
      setBodyError(false);
      try {
        const resp = await fetch(`/api/handoffs/${h.id}`);
        if (resp.ok) {
          const data = (await resp.json()) as { body?: string };
          setBody(data.body ?? "");
        } else {
          setBodyError(true);
        }
      } catch {
        setBodyError(true);
      } finally {
        setLoadingBody(false);
      }
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleBody}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                expanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            <span className="truncate font-medium text-sm leading-6 hover:underline">
              {h.title}
            </span>
          </span>
        </button>
        {h.version > 1 ? (
          <span className="mt-0.5 shrink-0 rounded-full border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            v{h.version}
          </span>
        ) : null}
        <span
          className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            h.visibility === "public"
              ? "border-[color:var(--ag-success)]/40 text-[color:var(--ag-success)]"
              : "border-muted-foreground/30 text-muted-foreground"
          }`}
        >
          {h.visibility === "public" ? "public" : "private"}
        </span>
      </div>

      {h.tldr ? (
        <p className="mt-1 line-clamp-2 pl-5 text-muted-foreground text-xs leading-5">
          {h.tldr}
        </p>
      ) : null}

      {/* meta + related spec chips */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-muted-foreground text-xs">
        {h.slug ? (
          <code className="rounded bg-muted px-1 py-0.5">{h.slug}</code>
        ) : null}
        {h.ticketId ? <span>{h.ticketId}</span> : null}
        <span>{dateFmt.format(h.createdAt)}</span>
        {specRefs.map((ref) => (
          <Link
            key={ref}
            href={`/d/${ref}`}
            className="rounded-full border border-[color:var(--ag-ai-blue)]/30 px-1.5 py-0.5 text-[10px] text-[color:var(--ag-ai-blue)] transition-colors hover:bg-[color:var(--ag-ai-blue)]/10"
          >
            /d/{ref}
          </Link>
        ))}
      </div>

      {expanded ? (
        <div className="mt-3 ml-5 rounded-lg border border-border/50 bg-bg-surface/30 px-3 py-2.5">
          {loadingBody ? (
            <p className="text-muted-foreground text-xs">Loading handoff…</p>
          ) : bodyError ? (
            <p className="text-destructive text-xs">
              Couldn't load the handoff body — collapse and re-open to retry.
            </p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:text-xs prose-li:text-xs prose-code:text-[11px] prose-pre:text-[11px] text-muted-foreground">
              <ReactMarkdown>{body ?? ""}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : null}

      {confirming ? (
        <div className="mt-3 flex items-center gap-2 pl-5">
          <span className="flex-1 text-destructive text-xs">
            Delete this handoff?
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-md bg-destructive/10 px-2.5 py-1 text-destructive text-xs transition-colors hover:bg-destructive/20 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancelDelete}
            className={SECONDARY_BTN}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 pl-5">
          {h.status === "queued" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("pick_up")}
              className={PRIMARY_BTN}
              title="Mark in progress (a fresh session is taking this)"
            >
              Pick up
            </button>
          ) : null}
          {h.status === "in_progress" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("complete")}
              className={PRIMARY_BTN}
              title="Mark this handoff done"
            >
              Done
            </button>
          ) : null}
          <a
            href={handoffDeepLink(h)}
            title="Open Claude Code in the repo with the continue-prompt pre-filled"
            className={
              h.status === "queued" || h.status === "in_progress"
                ? SECONDARY_BTN
                : PRIMARY_BTN
            }
          >
            Continue
          </a>
          <button
            type="button"
            onClick={onCopy}
            title="Copy the continue-prompt — paste into a fresh session (Omnara, etc.)"
            className={SECONDARY_BTN}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {h.status !== "queued" ? (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => onAction("requeue")}
                >
                  Re-queue
                </DropdownMenuItem>
              ) : null}
              {h.status !== "archived" ? (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => onAction("archive")}
                >
                  Archive
                </DropdownMenuItem>
              ) : null}
              {h.visibility === "public" ? (
                <>
                  <DropdownMenuItem disabled={busy} onClick={onCopyPublic}>
                    {copiedPublic ? "Copied public link" : "Copy public link"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() => onShare("unshare")}
                  >
                    Unshare content
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => onShare("share")}
                >
                  {copiedPublic ? "Copied public link" : "Share content"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onClick={onConfirmDelete}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
