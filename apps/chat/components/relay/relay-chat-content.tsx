"use client";

/**
 * RelayChatContent — center panel content for relay sessions.
 *
 * Uses the SAME Messages component as chat (reads from the store) but
 * with a different header and input component. Also includes the
 * approval overlay for pending tool approvals.
 */

import { AlertCircle, CheckCircle, Radio, XCircle } from "lucide-react";
import { Messages } from "@/components/messages";
import { useRelayContext } from "./relay-context";
import { RelayInput } from "./relay-input";

function RelayApprovalOverlay() {
  const { pendingApproval, approve } = useRelayContext();

  if (!pendingApproval) return null;

  return (
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
            onClick={() => approve(pendingApproval.approvalId, true)}
            className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            <CheckCircle className="size-3" />
            Allow
          </button>
          <button
            type="button"
            onClick={() => approve(pendingApproval.approvalId, false)}
            className="flex items-center gap-1 rounded bg-zinc-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
          >
            <XCircle className="size-3" />
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function RelayHeader() {
  const { sessionId, connected, ended } = useRelayContext();

  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3">
      <Radio className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">Relay Session</span>
      <span className="font-mono text-xs text-muted-foreground">
        {sessionId.slice(0, 8)}
      </span>
      <div
        className={`ml-auto size-2 shrink-0 rounded-full ${
          connected
            ? "bg-green-500"
            : ended
              ? "bg-zinc-500"
              : "animate-pulse bg-yellow-500"
        }`}
      />
    </div>
  );
}

export function RelayChatContent() {
  return (
    <div className="flex h-full flex-col">
      <RelayHeader />

      <Messages className="h-full min-h-0 flex-1" isReadonly={false} />

      <RelayApprovalOverlay />

      <div className="relative z-10 w-full shrink-0 pb-4">
        <div className="mx-auto w-full p-2 md:max-w-3xl">
          <RelayInput />
        </div>
      </div>
    </div>
  );
}
