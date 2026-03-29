"use client";

/**
 * Relay Context — relay-specific state that doesn't belong in the chat store.
 *
 * Provides workspace status (git), approval state, connection state, and
 * relay-specific actions (sendInput, approve). Components in the relay
 * three-panel layout read from this context.
 */

import { createContext, type ReactNode, useContext } from "react";
import type { DaemonMessage } from "@/lib/relay/protocol";

type WorkspaceStatus = Extract<DaemonMessage, { type: "workspace_status" }>;
type ApprovalEvent = Extract<DaemonMessage, { type: "approval_request" }>;

export interface RelayContextValue {
  sessionId: string;
  /** Git status from the workspace_status SSE event. */
  workspaceStatus: WorkspaceStatus | null;
  /** Pending approval request (shown as overlay in center panel). */
  pendingApproval: ApprovalEvent | null;
  /** Whether the SSE connection is open. */
  connected: boolean;
  /** Whether the session has ended. */
  ended: boolean;
  /** Send text input to the relay session. */
  sendInput: (text: string) => void;
  /** Approve or deny a pending approval request. */
  approve: (approvalId: string, approved: boolean) => void;
}

const RelayContext = createContext<RelayContextValue | null>(null);

export function RelayContextProvider({
  value,
  children,
}: {
  value: RelayContextValue;
  children: ReactNode;
}) {
  return (
    <RelayContext.Provider value={value}>{children}</RelayContext.Provider>
  );
}

export function useRelayContext(): RelayContextValue {
  const ctx = useContext(RelayContext);
  if (!ctx) {
    throw new Error("useRelayContext must be used within RelayContextProvider");
  }
  return ctx;
}
