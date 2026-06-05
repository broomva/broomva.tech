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
import type { SpecDocSummary } from "@/lib/db/spec-doc-queries";
import {
  claudeDeepLink,
  continuePrompt,
  groupBoardSpecs,
  ORCH_STATE_META,
  type OrchTone,
  viewerHref,
} from "./lib";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

// Orchestration-state pill tones → Arcan Glass tokens (BRO-1336). The board is
// grouped by content-state, so the per-card pill shows ORCH-state only.
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

/**
 * The Maestro board (BRO-1349) — client island over the owner's specs, grouped
 * by content-state. Mobile-first card layout (BRO-1400): each spec is a card
 * that stacks title / meta / actions vertically so nothing collides on a phone
 * (the Omnara webview); secondary actions live in a ⋯ overflow menu. Wires
 * Continue/Copy (BRO-1399), Trigger (BRO-1393), and archive/restore/delete to
 * the owner-scoped endpoints, refreshing the server component on success.
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
      // Guard the reset so a later copy on another row isn't cleared early.
      setTimeout(() => setCopiedId((cur) => (cur === d.id ? null : cur)), 1500);
    } catch {
      setError("Clipboard unavailable — open the spec and copy manually.");
    }
  }

  if (groups.length === 0) {
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

  return (
    <div className="space-y-7">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {error}
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.state}>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide">
              {group.label}
            </h2>
            <span className="text-muted-foreground text-xs">
              {group.docs.length}
            </span>
            <span className="hidden text-muted-foreground text-xs sm:inline">
              · {group.hint}
            </span>
          </div>
          <div className="space-y-2.5">
            {group.docs.map((d) => {
              const href = viewerHref(d) as Route;
              const ref = d.handle ?? d.id;
              const busy = pendingId === d.id;
              const orch = ORCH_STATE_META[d.orchState];
              const triggerable =
                d.orchState === "proposed" || d.orchState === "reviewing";
              return (
                <div
                  key={d.id}
                  className="rounded-xl border border-border/60 bg-bg-surface/40 px-4 py-3 transition-colors hover:border-[color:var(--ag-ai-blue)]/30"
                >
                  {/* Title + orch-state */}
                  <div className="flex items-start gap-2">
                    <Link
                      href={href}
                      className="min-w-0 flex-1 truncate font-medium text-sm leading-6 hover:underline"
                    >
                      {d.title}
                    </Link>
                    <span
                      title="Orchestration state"
                      className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${ORCH_TONE_CLASS[orch.tone]}`}
                    >
                      {orch.label}
                    </span>
                  </div>

                  {/* Meta */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
                    <code className="rounded bg-muted px-1 py-0.5">{ref}</code>
                    {d.version > 1 ? <span>v{d.version}</span> : null}
                    {d.sourcePath ? (
                      <span className="max-w-[60%] truncate">
                        {d.sourcePath}
                      </span>
                    ) : null}
                    {d.ticketId ? <span>{d.ticketId}</span> : null}
                    <span>{dateFmt.format(d.createdAt)}</span>
                  </div>

                  {/* Actions */}
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
                      {triggerable ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            mutate(d.id, { method: "POST" }, "/trigger")
                          }
                          title="Dispatch this spec (orch_state → triggered)"
                          className={PRIMARY_BTN}
                        >
                          Trigger
                        </button>
                      ) : null}
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
                            onClick={() =>
                              mutate(
                                d.id,
                                patch(
                                  d.state === "archived"
                                    ? "restore"
                                    : "archive",
                                ),
                              )
                            }
                          >
                            {d.state === "archived" ? "Restore" : "Archive"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
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
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
