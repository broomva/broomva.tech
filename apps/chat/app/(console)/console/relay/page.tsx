"use client";

import { Radio } from "lucide-react";
import { RelayLeftPanel } from "@/components/relay/relay-left-panel";
import { RelayRightPanel } from "@/components/relay/relay-right-panel";
import { RelayShell } from "@/components/relay/relay-shell";

export default function RelayPage() {
  return (
    <RelayShell>
      <RelayLeftPanel />

      {/* Center — empty state when no session is selected */}
      <div className="flex flex-1 flex-col items-center justify-center border-x bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Radio className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Select a session</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Choose a session from the sidebar or start a new one to connect to
              a remote agent.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — no session context yet, just placeholder */}
      <RelayRightPanel session={null} />
    </RelayShell>
  );
}
