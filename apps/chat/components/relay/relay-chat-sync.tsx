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
import type { DaemonMessage, HistoryMessage } from "@/lib/relay/protocol";
import { RelayTurnAccumulator } from "@/lib/relay/relay-message-adapter";

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

  // Accumulator for merging streaming events into messages
  const accumulatorRef = useRef<RelayTurnAccumulator | null>(null);
  // Track last message ID for parentMessageId chaining
  const lastMessageIdRef = useRef<string | null>(null);
  // Throttle store updates during streaming
  const pendingUpdateRef = useRef<ChatMessage | null>(null);
  const rafRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;
  // Track whether history has been loaded (prevents duplicate loads)
  const historyLoadedRef = useRef(false);

  // ── Initialize store ──────────────────────────────────────────────────
  // useLayoutEffect fires synchronously after DOM mutations but before
  // the browser paints — this ensures useChatId() returns the sessionId
  // before Messages renders visually.
  useLayoutEffect(() => {
    const state = storeApi.getState();
    state.setId(sessionId);
    state.setStatus("ready");
  }, [sessionId, storeApi]);

  // ── Load history from Claude Code session files ────────────────────
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/relay/sessions/${sessionId}/history`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: HistoryMessage[];
        };
        if (!data.messages || data.messages.length === 0) return;

        // Convert HistoryMessage[] to ChatMessage[]
        const chatMessages: ChatMessage[] = [];
        let parentId: string | null = null;

        for (const hm of data.messages) {
          const id = `hist-${chatMessages.length}-${Date.now()}`;
          const toolText = hm.tools
            .map(
              (t) =>
                `**${t.name}** \`${t.inputPreview.slice(0, 80)}\``,
            )
            .join("\n\n");
          const fullText = [hm.text, toolText]
            .filter(Boolean)
            .join("\n\n");
          if (!fullText) continue;

          chatMessages.push({
            id,
            role: hm.role === "user" ? "user" : "assistant",
            parts: [{ type: "text" as const, text: fullText }],
            metadata: {
              createdAt: hm.timestamp
                ? new Date(hm.timestamp)
                : new Date(),
              parentMessageId: parentId,
              selectedModel: (model ?? "claude-code") as never,
              activeStreamId: null,
            },
          });
          parentId = id;
        }

        if (chatMessages.length > 0) {
          const state = storeApi.getState();
          state.setMessages(chatMessages);
          lastMessageIdRef.current = parentId;
        }
      } catch {
        // History loading is best-effort — silently ignore errors.
      }
    }

    loadHistory();
  }, [sessionId, model, storeApi]);

  // ── SSE connection ────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/relay/sessions/${sessionId}/stream`);

    es.onopen = () => {
      setConnected(true);
      setConnectionError(false);
      retryCountRef.current = 0;
      // On reconnect, the server replays buffered events.
      // If history was loaded, we need to keep those messages and layer
      // SSE events on top. Only clear if no history was loaded yet.
      const state = storeApi.getState();
      const existingMessages = state.messages;
      if (existingMessages.length === 0) {
        state.setMessages([]);
      }
      state.setStatus("streaming");
      // Preserve lastMessageIdRef if history was loaded
      if (existingMessages.length === 0) {
        lastMessageIdRef.current = null;
      }
      accumulatorRef.current = new RelayTurnAccumulator(model);
      pendingUpdateRef.current = null;
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

        // Process through the accumulator
        const acc = accumulatorRef.current;
        if (!acc) return;
        acc.setParentMessageId(lastMessageIdRef.current);

        const result = acc.processEvent(event);
        if (!result) return;

        const { message, isNew } = result;

        if (isNew) {
          // New message — push directly
          storeApi.getState().pushMessage(message);
          lastMessageIdRef.current = message.id;
        } else {
          // Update existing message — throttle via rAF
          pendingUpdateRef.current = message;

          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              const pending = pendingUpdateRef.current;
              if (!pending) return;
              pendingUpdateRef.current = null;

              // Replace the last message in the store
              const state = storeApi.getState();
              const messages = state.messages;
              const idx = messages.findIndex((m) => m.id === pending.id);
              if (idx >= 0) {
                const updated = [...messages];
                updated[idx] = pending;
                state.setMessages(updated);
              }
            });
          }
        }
      } catch {
        // Silently ignore parse errors (keepalive comments, etc.)
      }
    };

    return () => {
      es.close();
      setConnected(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
