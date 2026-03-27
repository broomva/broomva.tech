"use client";

import {
  GitBranch,
  GitCommit,
  Layers,
  LayoutGrid,
  PanelRight,
  Plus,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { RelayNodeView, RelaySessionView } from "@/lib/console/types";
import type { DaemonMessage } from "@/lib/relay/protocol";

type WorkspaceStatus = Extract<DaemonMessage, { type: "workspace_status" }>;

interface Props {
  /** Current session shown in the detail view. */
  currentSessionId: string;
  /** Latest workspace status received from the SSE stream. */
  workspaceStatus: WorkspaceStatus | null;
}

export function RelayWorkspaceSidebar({
  currentSessionId,
  workspaceStatus,
}: Props) {
  const [nodes, setNodes] = useState<RelayNodeView[]>([]);
  const [sessions, setSessions] = useState<RelaySessionView[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [open, setOpen] = useState(false);

  // Fetch nodes + sessions when the sheet opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/relay/nodes", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/relay/sessions", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    ])
      .then(([nodesData, sessionsData]) => {
        const nodeList: RelayNodeView[] = nodesData.nodes ?? [];
        setNodes(nodeList);
        setSessions(sessionsData.sessions ?? []);
        if (!selectedNode && nodeList.length > 0) {
          setSelectedNode(nodeList[0].id);
        }
      })
      .catch(() => {});
  }, [open, selectedNode]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Open workspace sidebar"
        >
          <PanelRight className="size-4" />
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 border-b px-4 py-3">
          <SheetTitle className="text-sm">Workspace</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {/* Git status */}
            {workspaceStatus && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Git
                </h3>
                <div className="space-y-1.5 rounded-lg border bg-card p-3">
                  {workspaceStatus.branch && (
                    <div className="flex items-center gap-2 text-xs">
                      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-mono">{workspaceStatus.branch}</span>
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
                    {workspaceStatus.modified === 0 &&
                      workspaceStatus.staged === 0 && (
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
              </section>
            )}

            {/* Session config */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Start Session
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Node
                  </label>
                  <Select
                    value={selectedNode}
                    onValueChange={setSelectedNode}
                    disabled={nodes.length === 0}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue
                        placeholder={
                          nodes.length === 0
                            ? "No nodes online"
                            : "Select node..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className={`size-1.5 rounded-full ${
                                n.status === "online"
                                  ? "bg-green-500"
                                  : "bg-zinc-400"
                              }`}
                            />
                            {n.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  disabled={!selectedNode}
                  onClick={() => {
                    // TODO BRO-295: spawn session via POST /api/relay/sessions
                    setOpen(false);
                  }}
                >
                  <Plus className="size-3.5" />
                  New Session
                </Button>
              </div>
            </section>

            {/* All sessions */}
            {sessions.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sessions
                </h3>
                <div className="space-y-1">
                  {sessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/console/relay/session/${s.id}` as Route}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent ${
                        s.id === currentSessionId
                          ? "bg-accent font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          s.status === "active"
                            ? "bg-green-500"
                            : s.status === "idle"
                              ? "bg-yellow-500"
                              : "bg-zinc-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {s.name ?? "Untitled"}
                      </span>
                      {s.sessionType && (
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                          {s.sessionType}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Quick links */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Links
              </h3>
              <div className="space-y-1">
                <Link
                  href={"/console/relay" as Route}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <LayoutGrid className="size-3.5" />
                  Relay Dashboard
                </Link>
                <Link
                  href={"/console" as Route}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  <Layers className="size-3.5" />
                  Console
                </Link>
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
