"use client";

/**
 * RelayRightPanel — Git status + Session context + Memory.
 *
 * Reads workspace_status from RelayContext. Mirrors the ContextSidebar
 * collapsible section pattern. In future, this component could be mounted
 * inside ContextSidebar when a chat session is relay-backed.
 */

import {
  BrainIcon,
  ChevronRight,
  ClockIcon,
  CpuIcon,
  FolderIcon,
  GitBranch,
  GitCommit,
  RadioIcon,
  ServerIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RelaySessionView } from "@/lib/console/types";
import { useRelayContext } from "./relay-context";

// ── Section header (mirrors ContextSidebar pattern) ────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]/section:rotate-90" />
        <Icon className="size-3.5" />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Git section ────────────────────────────────────────────────────────────

function GitSection() {
  const { workspaceStatus } = useRelayContext();

  if (!workspaceStatus) {
    return (
      <SectionHeader icon={GitBranch} title="Git">
        <p className="text-[11px] text-muted-foreground">
          Waiting for workspace status...
        </p>
      </SectionHeader>
    );
  }

  return (
    <SectionHeader icon={GitBranch} title="Git">
      <div className="space-y-2">
        {workspaceStatus.branch && (
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-mono truncate">{workspaceStatus.branch}</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {workspaceStatus.modified > 0 && (
            <span className="text-yellow-500">
              {workspaceStatus.modified} modified
            </span>
          )}
          {workspaceStatus.staged > 0 && (
            <span className="text-green-500">
              {workspaceStatus.staged} staged
            </span>
          )}
          {workspaceStatus.modified === 0 && workspaceStatus.staged === 0 && (
            <span>Clean working tree</span>
          )}
        </div>

        {workspaceStatus.lastCommit && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <GitCommit className="mt-0.5 size-3.5 shrink-0" />
            <span className="font-mono truncate">
              {workspaceStatus.lastCommit}
            </span>
          </div>
        )}
      </div>
    </SectionHeader>
  );
}

// ── Session context section ────────────────────────────────────────────────

function SessionContextSection({
  session,
}: {
  session: RelaySessionView | null;
}) {
  const { sessionId } = useRelayContext();

  if (!session) {
    return (
      <SectionHeader icon={CpuIcon} title="Session">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono truncate">
              {sessionId.slice(0, 12)}...
            </span>
          </div>
        </div>
      </SectionHeader>
    );
  }

  return (
    <SectionHeader icon={CpuIcon} title="Session">
      <div className="space-y-2.5">
        {session.model && (
          <div className="flex items-center gap-2 text-xs">
            <CpuIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {session.model}
            </Badge>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <RadioIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {session.sessionType}
          </Badge>
        </div>

        {session.workdir && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <FolderIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="font-mono text-[11px] truncate">
              {session.workdir}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ServerIcon className="size-3.5 shrink-0" />
          <span className="truncate">{session.nodeId.slice(0, 8)}...</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClockIcon className="size-3.5 shrink-0" />
          <span>{new Date(session.createdAt).toLocaleString()}</span>
        </div>
      </div>
    </SectionHeader>
  );
}

// ── Memory section (placeholder for lago FS events) ────────────────────────

function MemorySection() {
  return (
    <SectionHeader icon={BrainIcon} title="Session Memory" defaultOpen={false}>
      <p className="text-[11px] text-muted-foreground">
        Memory events will appear here when lago FS integration is active.
      </p>
    </SectionHeader>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function RelayRightPanel({
  session,
}: {
  session?: RelaySessionView | null;
}) {
  return (
    <div className="hidden w-72 shrink-0 flex-col border-l bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0">
        <BrainIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Workspace</span>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto overflow-x-hidden">
        <GitSection />
        <div className="mx-3 h-px bg-border" />
        <SessionContextSection session={session ?? null} />
        <div className="mx-3 h-px bg-border" />
        <MemorySection />
      </ScrollArea>
    </div>
  );
}
