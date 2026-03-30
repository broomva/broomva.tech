"use client";

/**
 * RelayLeftPanel — Node → Workdir → Sessions sidebar.
 *
 * Three-tier collapsible hierarchy mirroring Claude Code's workspace view.
 */

import { ChevronRight, Copy, FolderOpen, Radio, Search, Terminal } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NewSessionDialog } from "@/components/relay/new-session-dialog";
import {
  type NodeGroup,
  useRelaySessionsList,
  type WorkdirGroup,
} from "@/hooks/use-relay-sessions-list";
import type { RelaySessionView } from "@/lib/console/types";
import { cn } from "@/lib/utils";

// ── Status dot ─────────────────────────────────────────────────────────────

function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const color =
    status === "online" || status === "active"
      ? "bg-green-500"
      : status === "idle"
        ? "bg-yellow-500"
        : status === "failed"
          ? "bg-red-500"
          : "bg-zinc-400";
  return (
    <span className={cn("size-1.5 shrink-0 rounded-full", color, className)} />
  );
}

// ── Session row ────────────────────────────────────────────────────────────

function SessionItem({
  session,
  isActive,
}: {
  session: RelaySessionView;
  isActive: boolean;
}) {
  return (
    <Link
      href={`/console/relay/session/${session.id}` as Route}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent",
        isActive ? "bg-accent font-medium" : "text-muted-foreground",
      )}
    >
      <StatusDot status={session.status} />
      <span className="min-w-0 flex-1 truncate">
        {session.name ?? "Untitled"}
      </span>
      {session.sessionType && (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
          {session.sessionType}
        </span>
      )}
    </Link>
  );
}

// ── Workdir group ──────────────────────────────────────────────────────────

function WorkdirGroupItem({
  group,
  currentSessionId,
}: {
  group: WorkdirGroup;
  currentSessionId?: string;
}) {
  // Show just the last 2 segments of the path
  const shortPath =
    group.workdir.split("/").filter(Boolean).slice(-2).join("/") ||
    group.workdir;

  return (
    <Collapsible defaultOpen className="group/workdir">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]/workdir:rotate-90" />
        <FolderOpen className="size-3" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {shortPath}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums">
          {group.sessions.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 space-y-0.5 border-l pl-2">
          {group.sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === currentSessionId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Node group ─────────────────────────────────────────────────────────────

function NodeGroupItem({
  group,
  currentSessionId,
}: {
  group: NodeGroup;
  currentSessionId?: string;
}) {
  return (
    <Collapsible defaultOpen className="group/node">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-accent/50 transition-colors">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]/node:rotate-90" />
        <StatusDot status={group.node.status} />
        <span className="min-w-0 flex-1 truncate">{group.node.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 space-y-1">
          {group.workdirs.map((wg) => (
            <WorkdirGroupItem
              key={wg.workdir}
              group={wg}
              currentSessionId={currentSessionId}
            />
          ))}
          {group.workdirs.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              No sessions
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Onboarding card ───────────────────────────────────────────────────────

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="group flex w-full items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800"
    >
      <Terminal className="size-3 shrink-0 text-zinc-500" />
      <span className="min-w-0 flex-1 truncate">{command}</span>
      <Copy
        className={cn(
          "size-3 shrink-0 transition-colors",
          copied
            ? "text-green-400"
            : "text-zinc-600 group-hover:text-zinc-400",
        )}
      />
    </button>
  );
}

function RelayOnboardingCard() {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div className="space-y-1">
        <p className="text-xs font-medium">Connect a machine</p>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Install the CLI, sign in, and start the relay to connect this machine
          to your console.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground">
          1. Install &amp; authenticate
        </p>
        <CopyCommand command="bun add -g @broomva/cli" />
        <CopyCommand command="broomva auth login" />
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground">
          2. Start relay
        </p>
        <CopyCommand command="broomva relay start" />
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Your machine will appear here once connected. You can also use{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
          life relay start
        </code>{" "}
        from the Rust CLI.
      </p>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function RelayLeftPanel({
  currentSessionId,
}: {
  currentSessionId?: string;
}) {
  const { grouped, nodes, metrics, loading } = useRelaySessionsList();
  const [search, setSearch] = useState("");

  // Filter by session name
  const filtered = search.trim()
    ? grouped
        .map((ng) => ({
          ...ng,
          workdirs: ng.workdirs
            .map((wg) => ({
              ...wg,
              sessions: wg.sessions.filter((s) =>
                (s.name ?? "").toLowerCase().includes(search.toLowerCase()),
              ),
            }))
            .filter((wg) => wg.sessions.length > 0),
        }))
        .filter((ng) => ng.workdirs.length > 0)
    : grouped;

  return (
    <div className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      {/* Header */}
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Radio className="size-4" />
          <span className="text-sm font-semibold">Relay</span>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
          <Search className="size-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* New Session */}
        <NewSessionDialog nodes={nodes} />
      </div>

      {/* Sessions tree */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {loading && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Loading...
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <RelayOnboardingCard />
          )}
          {filtered.map((ng) => (
            <NodeGroupItem
              key={ng.node.id}
              group={ng}
              currentSessionId={currentSessionId}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Footer metrics */}
      <div className="shrink-0 border-t px-3 py-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {metrics.nodesOnline} node{metrics.nodesOnline !== 1 ? "s" : ""}{" "}
            online
          </span>
          <span>{metrics.sessionsActive} active</span>
        </div>
      </div>
    </div>
  );
}
