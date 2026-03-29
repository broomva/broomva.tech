"use client";

/**
 * RelayChatSystem — orchestrator for relay sessions.
 *
 * Mirrors ChatSystem but for relay. Wraps the same CustomStoreProvider
 * and MessageTreeSync, swaps ChatSync for RelayChatSync. The same Messages
 * component renders from the store.
 */

import { memo } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import { RelayChatContent } from "./relay-chat-content";
import { RelayChatSync } from "./relay-chat-sync";

/**
 * NOTE: We intentionally omit MessageTreeSync here. That component syncs
 * messages from the DB (via tRPC + ChatIdProvider + DataStreamProvider) —
 * none of which exist in the relay/console context. Relay messages live
 * only in memory, written by RelayChatSync from the SSE stream.
 */
export const RelayChatSystem = memo(function RelayChatSystem({
  sessionId,
  model,
}: {
  sessionId: string;
  model?: string | null;
}) {
  return (
    <CustomStoreProvider<ChatMessage> initialMessages={[]} key={sessionId}>
      <RelayChatSync sessionId={sessionId} model={model}>
        <RelayChatContent />
      </RelayChatSync>
    </CustomStoreProvider>
  );
});
