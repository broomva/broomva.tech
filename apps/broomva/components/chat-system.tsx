"use client";

import {
  useChatActions,
  useChatStatus,
  useChatStore,
} from "@ai-sdk-tools/store";
import { memo, useEffect, useRef } from "react";
import { Chat } from "@/components/chat";
import { ChatSync } from "@/components/chat-sync";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { MessageTreeSync } from "@/components/message-tree-sync";
import { ArtifactProvider } from "@/hooks/use-artifact";
import type { AppModelId } from "@/lib/ai/app-models";
import type { ChatMessage, UiToolName } from "@/lib/ai/types";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import {
  useAddMessageToTree,
  useThreadEpoch,
} from "@/lib/stores/hooks-threads";
import { generateUUID } from "@/lib/utils";
import {
  ChatInputProvider,
  useChatInput,
} from "@/providers/chat-input-provider";

function AutoSubmitTrigger({ chatId }: { chatId: string }) {
  const status = useChatStatus();
  const { sendMessage } = useChatActions<ChatMessage>();
  // useChatActions falls back to a silent no-op until ChatSync's useChat
  // registers the real transport-bound sendMessage into the store — and
  // that registration is deferred (rAF-batched state sync). On a heavy
  // navigation (authed landing → /chat?q= handoff: RSC refetch + session
  // + sidebar queries) the 100ms timer below can win that race, consume
  // the auto-submit, and "send" into the void: message rendered in the
  // tree, no POST /api/chat ever issued (#250). Gate on the real
  // function being present; the effect re-runs when it registers.
  const transportReady = useChatStore((state) => Boolean(state.sendMessage));
  const addMessageToTree = useAddMessageToTree();
  const {
    tryConsumeAutoSubmit,
    selectedModelId,
    getInputValue,
    editorRef,
    handleInputChange,
  } = useChatInput();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || status !== "ready" || !transportReady) return;

    const timer = setTimeout(() => {
      if (firedRef.current) return;
      const input = getInputValue().trim();
      if (!input || !tryConsumeAutoSubmit()) return;

      firedRef.current = true;
      editorRef.current?.clear();
      handleInputChange("");

      const message: ChatMessage = {
        id: generateUUID(),
        parts: [{ type: "text", text: input }],
        metadata: {
          createdAt: new Date(),
          parentMessageId: null,
          selectedModel: selectedModelId,
          activeStreamId: null,
        },
        role: "user",
      };

      window.history.pushState({}, "", `/chat/${chatId}`);
      addMessageToTree(message);
      sendMessage(message);
    }, 100);

    return () => clearTimeout(timer);
  }, [
    status,
    transportReady,
    chatId,
    sendMessage,
    addMessageToTree,
    tryConsumeAutoSubmit,
    selectedModelId,
    getInputValue,
    editorRef,
    handleInputChange,
  ]);

  return null;
}

function ChatThreadSync({
  id,
  projectId,
  withHandler,
}: {
  id: string;
  projectId?: string;
  withHandler: boolean;
}) {
  const threadEpoch = useThreadEpoch();
  return (
    <>
      <ChatSync
        id={id}
        key={`chat-sync:${id}:${threadEpoch}`}
        projectId={projectId}
      />
      {withHandler ? (
        <DataStreamHandler id={id} key={`stream:${id}:${threadEpoch}`} />
      ) : null}
    </>
  );
}

export const ChatSystem = memo(function PureChatSystem({
  id,
  initialMessages,
  isReadonly,
  initialTool = null,
  initialInput,
  autoSubmit,
  overrideModelId,
  projectId,
}: {
  id: string;
  initialMessages: ChatMessage[];
  isReadonly: boolean;
  initialTool?: UiToolName | null;
  initialInput?: string;
  autoSubmit?: boolean;
  overrideModelId?: AppModelId;
  projectId?: string;
}) {
  return (
    <ArtifactProvider key={id}>
      <DataStreamProvider key={id}>
        <CustomStoreProvider<ChatMessage>
          initialMessages={initialMessages}
          key={id}
        >
          <MessageTreeSync />
          {isReadonly ? (
            <>
              <ChatThreadSync
                id={id}
                projectId={projectId}
                withHandler={false}
              />
              <Chat
                id={id}
                initialMessages={initialMessages}
                isReadonly={isReadonly}
                key={id}
                projectId={projectId}
              />
            </>
          ) : (
            <ChatInputProvider
              initialInput={initialInput}
              autoSubmit={autoSubmit}
              initialTool={initialTool ?? null}
              isProjectContext={!!projectId}
              localStorageEnabled={true}
              overrideModelId={overrideModelId}
            >
              <ChatThreadSync
                id={id}
                projectId={projectId}
                withHandler={true}
              />
              {autoSubmit && <AutoSubmitTrigger chatId={id} />}
              <Chat
                id={id}
                initialMessages={initialMessages}
                isReadonly={isReadonly}
                key={id}
                projectId={projectId}
              />
            </ChatInputProvider>
          )}
        </CustomStoreProvider>
      </DataStreamProvider>
    </ArtifactProvider>
  );
});
