"use client";

import { Clock, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { POLL } from "@/lib/console/constants";
import type { AgentSession } from "@/lib/console/types";
import { StatusIndicator } from "@/components/console/status-indicator";

const SESSION_STATUS_MAP = {
  active: "healthy",
  completed: "degraded",
  failed: "down",
} as const;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/console/health", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load sessions");
        setLoading(false);
        return;
      }
      // Derive mock sessions from health timestamp for now.
      // In a real setup this would call /api/console/sessions.
      const data = await res.json();
      const mockSessions: AgentSession[] = [
        {
          id: "sess-001",
          created_at: data.timestamp,
          status: "active",
        },
        {
          id: "sess-002",
          created_at: new Date(
            Date.now() - 3_600_000
          ).toISOString(),
          status: "completed",
        },
        {
          id: "sess-003",
          created_at: new Date(
            Date.now() - 7_200_000
          ).toISOString(),
          status: "failed",
        },
      ];
      setSessions(mockSessions);
      setError(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, POLL.SESSIONS);
    return () => clearInterval(id);
  }, [fetchSessions]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Sessions</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Active and recent agent sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSessions}
          className="glass-button"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="glass-card text-center text-text-secondary">
          {error}
        </div>
      ) : sessions.length === 0 ? (
        <div className="glass-card text-center text-text-secondary">
          No sessions found.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="glass-card flex items-center gap-4">
              <StatusIndicator
                status={SESSION_STATUS_MAP[session.status]}
                size="md"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-text-primary">
                    {session.id}
                  </span>
                  <span className="glass-badge">{session.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="size-3" />
                  {new Date(session.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
