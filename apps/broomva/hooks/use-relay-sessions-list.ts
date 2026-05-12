"use client";

/**
 * Hook for fetching and grouping relay nodes + sessions for the left sidebar.
 * Groups sessions by nodeId → workdir for the three-tier hierarchy.
 */

import { useCallback, useEffect, useState } from "react";
import { POLL } from "@/lib/console/constants";
import type {
  RelayMetrics,
  RelayNodeView,
  RelaySessionView,
} from "@/lib/console/types";

export interface WorkdirGroup {
  workdir: string;
  sessions: RelaySessionView[];
}

export interface NodeGroup {
  node: RelayNodeView;
  workdirs: WorkdirGroup[];
}

export function useRelaySessionsList() {
  const [nodes, setNodes] = useState<RelayNodeView[]>([]);
  const [sessions, setSessions] = useState<RelaySessionView[]>([]);
  const [metrics, setMetrics] = useState<RelayMetrics>({
    nodesOnline: 0,
    nodesTotal: 0,
    sessionsActive: 0,
    sessionsTotal: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [nodesRes, sessionsRes] = await Promise.all([
        fetch("/api/relay/nodes", { cache: "no-store" }),
        fetch("/api/relay/sessions", { cache: "no-store" }),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        setNodes(data.nodes ?? []);
        setMetrics(
          data.metrics ?? {
            nodesOnline: 0,
            nodesTotal: 0,
            sessionsActive: 0,
            sessionsTotal: 0,
          },
        );
      }

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      // Silent failure — sidebar still shows last known state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL.RELAY);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Group sessions by nodeId → workdir
  const grouped: NodeGroup[] = nodes.map((node) => {
    const nodeSessions = sessions.filter((s) => s.nodeId === node.id);
    const workdirMap = new Map<string, RelaySessionView[]>();

    for (const session of nodeSessions) {
      const wd = session.workdir ?? "/";
      const existing = workdirMap.get(wd) ?? [];
      existing.push(session);
      workdirMap.set(wd, existing);
    }

    const workdirs: WorkdirGroup[] = Array.from(workdirMap.entries()).map(
      ([workdir, wdSessions]) => ({
        workdir,
        sessions: wdSessions,
      }),
    );

    return { node, workdirs };
  });

  return { grouped, nodes, sessions, metrics, loading, refetch: fetchData };
}
