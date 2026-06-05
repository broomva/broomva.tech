"use client";

import { MoreHorizontal } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SpecDocOrchState } from "@/lib/db/schema";
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";
import {
  activeCount,
  archivedDocs,
  attentionCount,
  claudeDeepLink,
  continuePrompt,
  groupByOrchState,
  type OrchTone,
  orchSummary,
  viewerHref,
} from "./lib";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Orchestration-state tones → Arcan Glass tokens (BRO-1336). Used by the group
// headers and the triage filter chips.
const ORCH_TONE_CLASS: Record<OrchTone, string> = {
  muted: "border-muted-foreground/30 text-muted-foreground",
  active: "border-[color:var(--ag-ai-blue)]/40 text-[color:var(--ag-ai-blue)]",
  warn: "border-[color:var(--ag-warning)]/40 text-[color:var(--ag-warning)]",
  review:
    "border-[color:var(--ag-accent-blue)]/40 text-[color:var(--ag-accent-blue)]",
  done: "border-[color:var(--ag-success)]/40 text-[color:var(--ag-success)]",
  canceled: "border-[color:var(--ag-error)]/40 text-[color:var(--ag-error)]",
};

const SECONDARY_BTN =
  "rounded-md px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";
const PRIMARY_BTN =
  "rounded-md border border-[color:var(--ag-ai-blue)]/40 px-2.5 py-1 text-[color:var(--ag-ai-blue)] text-xs transition-colors hover:bg-[color:var(--ag-ai-blue)]/10 disabled:opacity-50";
const CARD =
  "rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-3 transition-colors hover:border-[color:var(--ag-ai-blue)]/30";

function chipClass(selected: boolean, tone?: OrchTone): string {
  const base = "rounded-full border px-2.5 py-1 text-xs transition-colors";
  if (selected) {
    return `${base} border-[color:var(--ag-ai-blue)]/50 bg-[color:var(--ag-ai-blue)]/10 text-foreground`;
  }
  return `${base} ${
    tone ? ORCH_TONE_CLASS[tone] : "border-border/60 text-muted-foreground"
  } hover:bg-muted/50`;
}

/**
 * The Maestro board (BRO-1349) — the spec orchestration control surface. Grouped
 * by ORCH-state, attention-first (BRO-1402): a triage header surfaces what needs
 * the human, a filter strip narrows by state, and specs flow Blocked → Review →
 * Running → … → Done. Archived specs collapse into a manage section. Cards are
 * mobile-first (BRO-1400) and wire Continue/Copy (BRO-1399) + archive/restore/
 * delete to the owner-scoped endpoints. The live Trigger control is hidden until
 * the relay runtime ships (BRO-1407, /d/maestro-relay-phase-1b) — until then
 * orch-state is read-only and a spec is run via Continue (Claude Code) / Copy
 * (Omnara). The /trigger endpoint + N=1 budget stay server-side, ready to wire.
 */
export function MaestroBoard({ docs }: { docs: SpecDocSummary[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpecDocOrchState | null>(null);

  const groups = groupByOrchState(docs);
  const summary = orchSummary(docs);
  const attention = attentionCount(docs);
  const active = activeCount(docs);
  const archived = archivedDocs(docs);

  async function mutate(id: string, init: RequestInit, suffix = "") {
    setPendingId(id);
    setError(null);
    try {
      const resp = await fetch(`/api/docs/${id}${suffix}`, init);
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

  function patch(action: "archive" | "restore"): RequestInit {
    return {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    };
  }

  // Copy the continue-prompt to the clipboard (the phone → Omnara paste path).
  async function copyPrompt(d: SpecDocSummary) {
    try {
      await navigator.clipboard.writeText(continuePrompt(d));
      setCopiedId(d.id);
      setTimeout(() => setCopiedId((cur) => (cur === d.id ? null : cur)), 1500);
    } catch {
      setError("Clipboard unavailable — open the spec and copy manually.");
    }
  }

  if (active === 0 && archived.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        No specs yet. Publish one with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          broomva docs publish file.html --as &lt;handle&gt;
        </code>
        .
      </div>
    );
  }

  const visibleGroups = filter
    ? groups.filter((g) => g.state === filter)
    : groups;

  const renderCard = (d: SpecDocSummary) => {
    const href = viewerHref(d) as Route;
    const ref = d.handle ?? d.id;
    const busy = pendingId === d.id;
    return (
      <div key={d.id} className={CARD}>
        <div className="flex items-start gap-2">
          <Link
            href={href}
            className="min-w-0 flex-1 truncate font-medium text-sm leading-6 hover:underline"
          >
            {d.title}
          </Link>
          {d.state === "draft" ? (
            <span className="mt-0.5 shrink-0 rounded-full border border-[color:var(--ag-warning)]/40 px-1.5 py-0.5 text-[10px] text-[color:var(--ag-warning)] uppercase tracking-wide">
              draft
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
          <code className="rounded bg-muted px-1 py-0.5">{ref}</code>
          {d.version > 1 ? <span>v{d.version}</span> : null}
          {d.sourcePath ? (
            <span className="max-w-[60%] truncate">{d.sourcePath}</span>
          ) : null}
          {d.ticketId ? <span>{d.ticketId}</span> : null}
          <span>{dateFmt.format(d.createdAt)}</span>
        </div>

        {confirmId === d.id ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="flex-1 text-destructive text-xs">
              Delete this spec?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => mutate(d.id, { method: "DELETE" })}
              className="rounded-md bg-destructive/10 px-2.5 py-1 text-destructive text-xs transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmId(null)}
              className={SECONDARY_BTN}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5">
            <a
              href={claudeDeepLink(d)}
              title="Open Claude Code in the repo with a continue-prompt pre-filled"
              className={PRIMARY_BTN}
            >
              Continue
            </a>
            <button
              type="button"
              onClick={() => copyPrompt(d)}
              title="Copy the continue-prompt — paste into a new Omnara session from your phone"
              className={SECONDARY_BTN}
            >
              {copiedId === d.id ? "Copied" : "Copy"}
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
                <DropdownMenuItem asChild>
                  <Link href={href}>Open spec</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      d.id,
                      patch(d.state === "archived" ? "restore" : "archive"),
                    )
                  }
                >
                  {d.state === "archived" ? "Restore" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => setConfirmId(d.id)}
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
  };

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
          {attention > 0 ? (
            <span className="font-medium text-[color:var(--ag-warning)] text-sm">
              {attention} {attention === 1 ? "spec needs" : "specs need"} your
              attention
            </span>
          ) : (
            <span className="font-medium text-[color:var(--ag-success)] text-sm">
              All clear
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            · {active} active
            {archived.length > 0 ? ` · ${archived.length} archived` : ""}
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
                key={s.state}
                type="button"
                onClick={() => setFilter(filter === s.state ? null : s.state)}
                className={chipClass(filter === s.state, s.tone)}
              >
                {s.label} <span className="opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Orch-state groups (attention-first) */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          No specs in this state.
        </div>
      ) : (
        visibleGroups.map((group) => (
          <section key={group.state}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${ORCH_TONE_CLASS[group.tone]}`}
              >
                {group.label}
              </span>
              <span className="text-muted-foreground text-xs">
                {group.docs.length}
              </span>
            </div>
            <div className="space-y-2.5">{group.docs.map(renderCard)}</div>
          </section>
        ))
      )}

      {/* Archived — collapsed manage section, off the control view */}
      {archived.length > 0 && !filter ? (
        <details className="rounded-xl border border-border/60 bg-bg-surface/20">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-muted-foreground text-sm">
            Archived · {archived.length}
          </summary>
          <div className="space-y-2.5 px-3 pb-3">
            {archived.map(renderCard)}
          </div>
        </details>
      ) : null}
    </div>
  );
}
