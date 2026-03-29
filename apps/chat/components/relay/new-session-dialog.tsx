"use client";

/**
 * NewSessionDialog — spawn a relay session.
 *
 * Dialog with node selector, session type, workdir, and model inputs.
 * Submits to POST /api/relay/sessions and navigates to the new session.
 */

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RelayNodeView } from "@/lib/console/types";

interface NewSessionDialogProps {
  nodes: RelayNodeView[];
  trigger?: React.ReactNode;
}

export function NewSessionDialog({ nodes, trigger }: NewSessionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState("");
  const [sessionType, setSessionType] = useState<string>("claude-code");
  const [workdir, setWorkdir] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onlineNodes = nodes.filter((n) => n.status === "online");

  async function handleSubmit() {
    if (!nodeId || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/relay/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          sessionType,
          workdir: workdir || "/",
          name: name || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setOpen(false);
        router.push(`/console/relay/session/${data.sessionId}`);
      }
    } catch {
      // TODO: show toast on error
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="w-full">
            <Plus className="size-3.5" />
            New Session
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Relay Session</DialogTitle>
          <DialogDescription>
            Spawn a new agent session on a relay node.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Node */}
          <div>
            <span className="mb-1.5 block text-xs font-medium">Node</span>
            <Select
              value={nodeId}
              onValueChange={setNodeId}
              disabled={onlineNodes.length === 0}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={
                    onlineNodes.length === 0
                      ? "No nodes online"
                      : "Select a node..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {onlineNodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-green-500" />
                      {n.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Session type */}
          <div>
            <span className="mb-1.5 block text-xs font-medium">
              Session Type
            </span>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-code">Claude Code</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="arcan">Arcan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Workdir */}
          <div>
            <label
              htmlFor="relay-workdir"
              className="mb-1.5 block text-xs font-medium"
            >
              Working Directory
            </label>
            <input
              id="relay-workdir"
              type="text"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
              placeholder="/home/user/project"
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Name (optional) */}
          <div>
            <label
              htmlFor="relay-name"
              className="mb-1.5 block text-xs font-medium"
            >
              Name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="relay-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated from workdir"
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!nodeId || submitting}
            size="sm"
          >
            {submitting ? "Spawning..." : "Start Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
