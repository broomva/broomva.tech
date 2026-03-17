"use client";

import {
  ChatLayout,
  ChatLayoutHandle,
  ChatLayoutMain,
  ChatLayoutSecondary,
} from "@/components/chat/chat-layout";
import { MainChatPanel } from "@/components/chat/main-chat-panel";
import { SecondaryChatPanel } from "@/components/chat/secondary-chat-panel";
import { useArtifactSelector } from "@/hooks/use-artifact";
import type { ChatMessage } from "@/lib/ai/types";

export function Chat({
  id,
  initialMessages: _initialMessages,
  isReadonly,
  projectId,
}: {
  id: string;
  initialMessages: ChatMessage[];
  isReadonly: boolean;
  projectId?: string;
}) {
  const isSecondaryPanelVisible = useArtifactSelector(
    (state) => state.isVisible
  );

  return (
    <ChatLayout isSecondaryPanelVisible={isSecondaryPanelVisible}>
      <ChatLayoutMain>
        <MainChatPanel
          chatId={id}
          className="flex h-full min-w-0 flex-1 flex-col"
          isReadonly={isReadonly}
          projectId={projectId}
        />
      </ChatLayoutMain>

      <ChatLayoutHandle />

      <ChatLayoutSecondary>
        <SecondaryChatPanel
          className="flex h-full min-w-0 flex-1 flex-col"
          isReadonly={isReadonly}
        />
      </ChatLayoutSecondary>
    </ChatLayout>
  );
}
