"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { RelayChatSystem } from "@/components/relay/relay-chat-system";
import { RelayLeftPanel } from "@/components/relay/relay-left-panel";
import { RelayRightPanel } from "@/components/relay/relay-right-panel";
import { RelayShell } from "@/components/relay/relay-shell";
import type { RelaySessionView } from "@/lib/console/types";

export default function RelaySessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<RelaySessionView | null>(null);

  // Fetch session metadata once on mount
  useEffect(() => {
    fetch(`/api/relay/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => setSession(d.session ?? null))
      .catch(() => {});
  }, [id]);

  return (
    <RelayShell>
      <RelayLeftPanel currentSessionId={id} />

      {/* Center — the chat system writing to the same store */}
      <div className="flex flex-1 flex-col min-w-0 border-x bg-background">
        <RelayChatSystem
          sessionId={id}
          model={session?.model}
        />
      </div>

      <RelayRightPanel session={session} />
    </RelayShell>
  );
}
