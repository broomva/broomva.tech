"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";
import {
  type BoardState,
  claudeDeepLink,
  continuePrompt,
  groupBoardSpecs,
  ORCH_STATE_META,
  type OrchTone,
  viewerHref,
} from "./lib";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Arcan Glass semantic tokens (globals.css) — not raw Tailwind palette colors.
const STATE_BADGE_CLASS: Record<BoardState, string> = {
  published:
    "border-[color:var(--ag-success)]/40 text-[color:var(--ag-success)]",
  draft: "border-[color:var(--ag-warning)]/40 text-[color:var(--ag-warning)]",
  archived: "border-muted-foreground/30 text-muted-foreground",
};

// Orchestration-state pill tones → Arcan Glass tokens (BRO-1336).
const ORCH_TONE_CLASS: Record<OrchTone, string> = {
  muted: "border-muted-foreground/30 text-muted-foreground",
  active: "border-[color:var(--ag-ai-blue)]/40 text-[color:var(--ag-ai-blue)]",
  warn: "border-[color:var(--ag-warning)]/40 text-[color:var(--ag-warning)]",
  review:
    "border-[color:var(--ag-accent-blue)]/40 text-[color:var(--ag-accent-blue)]",
  done: "border-[color:var(--ag-success)]/40 text-[color:var(--ag-success)]",
  canceled: "border-[color:var(--ag-error)]/40 text-[color:var(--ag-error)]",
};

/**
 * The Maestro board (BRO-1349) — client island over the owner's specs. Lists
 * them grouped by content-state and wires the archive / restore / delete
 * actions to the existing owner-scoped /api/docs/[id] endpoints (cookie auth,
 * same origin), refreshing the server component on success.
 */
export function MaestroBoard({ docs }: { docs: SpecDocSummary[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const groups = groupBoardSpecs(docs);

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
      // Guard the reset: a later copy on another row must not be cleared by
      // this row's stale timer (only clear if still showing this id).
      setTimeout(() => setCopiedId((cur) => (cur === d.id ? null : cur)), 1500);
    } catch {
      setError("Clipboard unavailable — open the spec and copy manually.");
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
        No specs yet. Publish one with{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          broomva docs publish file.html --as &lt;handle&gt;
        </code>
        .
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {error}
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.state}>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide">
              {group.label}
            </h2>
            <span className="text-muted-foreground text-xs">
              {group.docs.length}
            </span>
            <span className="text-muted-foreground text-xs">
              · {group.hint}
            </span>
          </div>
          <ul className="divide-y rounded-lg border">
            {group.docs.map((d) => {
              const ref = d.handle ?? d.id;
              // viewerHref returns a validated route string; cast to the Next
              // typed-routes brand (the dynamic /d/<handle>[/v/<n>] target).
              const href = viewerHref(d) as Route;
              const busy = pendingId === d.id;
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={href}
                        className="truncate font-medium text-sm hover:underline"
                      >
                        {d.title}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATE_BADGE_CLASS[d.state as BoardState]}`}
                      >
                        {d.state}
                      </span>
                      <span
                        title="Orchestration state"
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${ORCH_TONE_CLASS[ORCH_STATE_META[d.orchState].tone]}`}
                      >
                        {ORCH_STATE_META[d.orchState].label}
                      </span>
                      {d.version > 1 ? (
                        <span className="shrink-0 text-muted-foreground text-xs">
                          v{d.version}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
                      <code className="rounded bg-muted px-1 py-0.5">
                        {ref}
                      </code>
                      {d.sourcePath ? (
                        <span className="truncate">{d.sourcePath}</span>
                      ) : null}
                      {d.ticketId ? (
                        <span className="shrink-0">{d.ticketId}</span>
                      ) : null}
                      <span className="shrink-0">
                        {dateFmt.format(d.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={claudeDeepLink(d)}
                      title="Open Claude Code in the repo with a continue-prompt pre-filled (claude-cli://)"
                      className="rounded-md border border-[color:var(--ag-ai-blue)]/40 px-2 py-1 text-[color:var(--ag-ai-blue)] text-xs transition-colors hover:bg-[color:var(--ag-ai-blue)]/10"
                    >
                      Continue
                    </a>
                    <button
                      type="button"
                      onClick={() => copyPrompt(d)}
                      title="Copy the continue-prompt — paste into a new Omnara session from your phone"
                      className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {copiedId === d.id ? "Copied" : "Copy"}
                    </button>
                    {d.orchState === "proposed" ||
                    d.orchState === "reviewing" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          mutate(d.id, { method: "POST" }, "/trigger")
                        }
                        title="Dispatch this spec (orch_state → triggered)"
                        className="rounded-md border border-[color:var(--ag-ai-blue)]/40 px-2 py-1 text-[color:var(--ag-ai-blue)] text-xs transition-colors hover:bg-[color:var(--ag-ai-blue)]/10 disabled:opacity-50"
                      >
                        Trigger
                      </button>
                    ) : null}
                    <Link
                      href={href}
                      className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
                    >
                      View
                    </Link>
                    {d.state === "archived" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => mutate(d.id, patch("restore"))}
                        className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => mutate(d.id, patch("archive"))}
                        className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                    {confirmId === d.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => mutate(d.id, { method: "DELETE" })}
                          className="rounded-md bg-destructive/10 px-2 py-1 text-destructive text-xs transition-colors hover:bg-destructive/20 disabled:opacity-50"
                        >
                          Confirm?
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmId(null)}
                          className="rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(d.id)}
                        className="rounded-md px-2 py-1 text-destructive/80 text-xs transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
