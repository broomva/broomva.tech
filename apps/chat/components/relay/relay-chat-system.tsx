"use client";

/**
 * RelayChatSystem — orchestrator for relay sessions.
 *
 * Mirrors ChatSystem but for relay. Wraps the same CustomStoreProvider
 * and MessageTreeSync, swaps ChatSync for RelayChatSync. The same Messages
 * component renders from the store.
 */

import { memo } from "react";
import { MessageTreeSync } from "@/components/message-tree-sync";
import type { ChatMessage } from "@/lib/ai/types";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import { RelayChatContent } from "./relay-chat-content";
import { RelayChatSync } from "./relay-chat-sync";

export const RelayChatSystem = memo(function RelayChatSystem({
  sessionId,
  model,
}: {
  sessionId: string;
  model?: string | null;
}) {
  return (
    <CustomStoreProvider<ChatMessage> initialMessages={[]} key={sessionId}>
      <MessageTreeSync />
      <RelayChatSync sessionId={sessionId} model={model}>
        <RelayChatContent />
      </RelayChatSync>
    </CustomStoreProvider>
  );
});
