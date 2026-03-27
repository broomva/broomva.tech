"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle,
  Send,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RelaySessionView } from "@/lib/console/types";
import type { DaemonMessage } from "@/lib/relay/protocol";

type SessionEvent = DaemonMessage & { _key: number };
type ApprovalEvent = Extract<DaemonMessage, { type: "approval_request" }>;
type ToolEventMsg = Extract<DaemonMessage, { type: "tool_event" }>;

export default function RelaySessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<RelaySessionView | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [pendingApproval, setPendingApproval] =
    useState<ApprovalEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);

  // Fetch session info once on mount
  useEffect(() => {
    fetch(`/api/relay/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session ?? null))
      .catch(() => {});
  }, [id]);

  // SSE stream for live session output.
  // On (re)connect the server replays the last 500 buffered events before
  // subscribing to live events, so we clear stale state on every open to
  // avoid duplicates.
  useEffect(() => {
    const es = new EventSource(`/api/relay/sessions/${id}/stream`);

    es.onopen = () => {
      setConnected(true);
      // Clear events on reconnect — replay buffer will repopulate them.
      setEvents([]);
      keyRef.current = 0;
    };
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as DaemonMessage;
        keyRef.current += 1;
        setEvents((prev) => [...prev, { ...event, _key: keyRef.current }]);

        if (event.type === "approval_request") {
          setPendingApproval(event as ApprovalEvent);
        }
        if (event.type === "session_ended") {
          setEnded(true);
          setConnected(false);
        }

        requestAnimationFrame(() => {
          if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
          }
        });
      } catch {}
    };

    return () => es.close();
  }, [id]);

  const handleSendInput = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");
    await fetch(`/api/relay/sessions/${id}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: `${text}\n` }),
    }).catch(() => {});
  }, [id, inputValue]);

  const handleApprove = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;
      const { approvalId } = pendingApproval;
      setPendingApproval(null);
      await fetch(`/api/relay/sessions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, approved }),
      }).catch(() => {});
    },
    [id, pendingApproval],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendInput();
    }
  };

  const isActive =
    !ended &&
    (session?.status === "active" ||
      session?.status === "idle" ||
      session === null);

  return (
    <div className="-mx-4 -mt-4 flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3">
        <Link
          href={"/console/relay" as Route}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-medium">
              {session?.name ?? "Session"}
            </h1>
            {session?.sessionType && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {session.sessionType}
              </span>
            )}
            {session?.model && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {session.model}
              </span>
            )}
            <div
              className={`size-2 shrink-0 rounded-full ${
                connected
                  ? "bg-green-500"
                  : ended
                    ? "bg-zinc-500"
                    : "bg-yellow-500 animate-pulse"
              }`}
            />
          </div>
          {session?.workdir && (
            <div className="truncate font-mono text-xs text-muted-foreground">
              {session.workdir}
            </div>
          )}
        </div>

        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {id.slice(0, 8)}
        </span>
      </div>

      {/* ── Event feed ─────────────────────────────────────────────── */}
      <div
        ref={feedRef}
        className="flex-1 space-y-1 overflow-y-auto p-4"
      >
        {events.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {connected ? "Waiting for session output..." : "Connecting to session..."}
          </div>
        )}
        {events.map((event) => (
          <EventCard key={event._key} event={event} />
        ))}
      </div>

      {/* ── Approval overlay ───────────────────────────────────────── */}
      {pendingApproval && (
        <div className="mx-4 mb-2 shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {pendingApproval.capability}
              </p>
              {pendingApproval.context && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {pendingApproval.context}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => handleApprove(true)}
                className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
              >
                <CheckCircle className="size-3" />
                Allow
              </button>
              <button
                type="button"
                onClick={() => handleApprove(false)}
                className="flex items-center gap-1 rounded bg-zinc-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
              >
                <XCircle className="size-3" />
                Deny
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t bg-background px-4 py-3">
        {ended ? (
          <p className="text-center text-xs text-muted-foreground">
            Session ended
          </p>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
            <Terminal className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Send input to session..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={!isActive}
            />
            <button
              type="button"
              onClick={handleSendInput}
              disabled={!inputValue.trim() || !isActive}
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Event card components ─────────────────────────────────────────────────

function EventCard({ event }: { event: DaemonMessage }) {
  switch (event.type) {
    case "output":
      return (
        <div className="rounded-md bg-zinc-950 px-3 py-2 dark:bg-zinc-900">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
            {event.data}
          </pre>
        </div>
      );

    case "assistant_message":
      return (
        <div className="flex items-start gap-2.5 rounded-lg border bg-blue-500/5 px-3 py-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-blue-500" />
          <p className="text-sm leading-relaxed">{event.text}</p>
        </div>
      );

    case "tool_event":
      return <ToolCard event={event} />;

    case "approval_request":
      // Shown in the overlay above; render a compact history item here
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>
            Approval requested:{" "}
            <span className="font-medium">{event.capability}</span>
          </span>
        </div>
      );

    case "session_ended":
      return (
        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">
            Session ended — {event.reason}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      );

    case "error":
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          [{event.code}] {event.message}
        </div>
      );

    default:
      return null;
  }
}

const TOOL_COLORS: Record<string, string> = {
  Edit: "text-yellow-500",
  Write: "text-yellow-500",
  Bash: "text-green-500",
  Read: "text-blue-400",
  Glob: "text-purple-400",
  Grep: "text-orange-400",
  Agent: "text-pink-400",
  WebFetch: "text-cyan-400",
  WebSearch: "text-cyan-400",
};

function getToolSummary(
  toolName: string,
  input: Record<string, unknown>,
): string {
  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read":
      return String(input.file_path ?? input.path ?? "");
    case "Bash":
      return String(input.command ?? "").slice(0, 100);
    case "Glob":
    case "Grep":
      return String(input.pattern ?? "");
    default:
      return "";
  }
}

function ToolCard({ event }: { event: ToolEventMsg }) {
  const color = TOOL_COLORS[event.toolName] ?? "text-muted-foreground";
  const summary = getToolSummary(event.toolName, event.input);

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <Wrench className={`size-3.5 shrink-0 ${color}`} />
      <span className={`font-mono text-xs font-medium ${color}`}>
        {event.toolName}
      </span>
      {summary && (
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {summary}
        </span>
      )}
    </div>
  );
}
