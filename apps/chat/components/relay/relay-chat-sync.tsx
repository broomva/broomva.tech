"use client";

/**
 * RelayChatSync — SSE → Store writer for relay sessions.
 *
 * This is the relay counterpart to ChatSync. It:
 * 1. Connects to the relay SSE stream
 * 2. Converts DaemonMessage events to ChatMessage via the adapter
 * 3. Writes messages to the CustomStoreProvider Zustand store
 * 4. Manages relay-specific state (workspace status, approvals, connection)
 *
 * The same Messages → AssistantMessage → MessageParts pipeline renders them.
 */

import { useChatStoreApi } from "@ai-sdk-tools/store";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ChatMessage } from "@/lib/ai/types";
import type { DaemonMessage } from "@/lib/relay/protocol";
import { daemonEventToChatMessage } from "@/lib/relay/relay-message-adapter";

import { RelayContextProvider, type RelayContextValue } from "./relay-context";

type WorkspaceStatus = Extract<DaemonMessage, { type: "workspace_status" }>;
type ApprovalEvent = Extract<DaemonMessage, { type: "approval_request" }>;

interface RelayChatSyncProps {
  sessionId: string;
  model?: string | null;
  children: React.ReactNode;
}

export function RelayChatSync({
  sessionId,
  model,
  children,
}: RelayChatSyncProps) {
  const storeApi = useChatStoreApi<ChatMessage>();

  const [workspaceStatus, setWorkspaceStatus] =
    useState<WorkspaceStatus | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalEvent | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  // Track last message ID for parentMessageId chaining
  const lastMessageIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // ── Initialize store ──────────────────────────────────────────────────
  // useLayoutEffect fires synchronously after DOM mutations but before
  // the browser paints — this ensures useChatId() returns the sessionId
  // before Messages renders visually.
  useLayoutEffect(() => {
    const state = storeApi.getState();
    state.setId(sessionId);
    state.setStatus("ready");
  }, [sessionId, storeApi]);

  // ── SSE connection ────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/relay/sessions/${sessionId}/stream`);

    es.onopen = () => {
      setConnected(true);
      setConnectionError(false);
      retryCountRef.current = 0;
      // On reconnect, the server replays buffered events.
      // Clear store messages to avoid duplicates from replay.
      // Set status to "streaming" BEFORE any messages arrive so that
      // pushMessage() immediately updates _throttledMessages (which
      // getMessageIds() reads from). Without this, the first messages
      // go through the throttled path and don't trigger re-renders.
      const state = storeApi.getState();
      state.setMessages([]);
      state.setStatus("streaming");
      lastMessageIdRef.current = null;
    };

    es.onerror = () => {
      setConnected(false);
      retryCountRef.current += 1;
      // EventSource auto-reconnects, but if we exceed retries the
      // server is likely unreachable (e.g. Redis down). Close the
      // connection and show an error state instead of crashing.
      if (retryCountRef.current >= maxRetries) {
        es.close();
        setConnectionError(true);
      }
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as DaemonMessage;

        // workspace_status → relay context only (not message feed)
        if (event.type === "workspace_status") {
          setWorkspaceStatus(event as WorkspaceStatus);
          return;
        }

        // approval_request → context overlay + message feed
        if (event.type === "approval_request") {
          setPendingApproval(event as ApprovalEvent);
        }

        // session_ended → mark session as ended
        if (event.type === "session_ended") {
          setEnded(true);
          setConnected(false);
        }

        // Convert and write to store
        const chatMessage = daemonEventToChatMessage(event, {
          parentMessageId: lastMessageIdRef.current,
          model,
        });

        if (chatMessage) {
          // pushMessage writes to the base messages array that
          // useMessageIds() reads from. Status is already "streaming"
          // (set in onopen) so pushMessage immediately updates
          // _throttledMessages, triggering re-renders.
          storeApi.getState().pushMessage(chatMessage);
          lastMessageIdRef.current = chatMessage.id;
        }
      } catch {
        // Silently ignore parse errors (keepalive comments, etc.)
      }
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [sessionId, model, storeApi]);

  // ── Relay actions ─────────────────────────────────────────────────────
  const sendInput = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Optimistic local echo — add user message to the store immediately
      // so the user sees their input in the chat before the daemon responds.
      const userMessage = {
        id: `user-${Date.now()}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: trimmed }],
        metadata: {
          createdAt: new Date(),
          parentMessageId: lastMessageIdRef.current,
          selectedModel: (model ?? "claude-code") as never,
          activeStreamId: null,
        },
      } satisfies ChatMessage;
      storeApi.getState().pushMessage(userMessage);
      lastMessageIdRef.current = userMessage.id;

      await fetch(`/api/relay/sessions/${sessionId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: `${trimmed}\n` }),
      }).catch(() => {});
    },
    [sessionId, storeApi],
  );

  const approve = useCallback(
    async (approvalId: string, approved: boolean) => {
      setPendingApproval(null);
      await fetch(`/api/relay/sessions/${sessionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, approved }),
      }).catch(() => {});
    },
    [sessionId],
  );

  // ── Provide relay context ─────────────────────────────────────────────
  const contextValue: RelayContextValue = {
    sessionId,
    workspaceStatus,
    pendingApproval,
    connected,
    ended,
    connectionError,
    sendInput,
    approve,
  };

  return (
    <RelayContextProvider value={contextValue}>{children}</RelayContextProvider>
  );
}
