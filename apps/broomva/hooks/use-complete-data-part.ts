"use client";

import { useChatActions, useChatStoreApi } from "@ai-sdk-tools/store";
import { useEffect } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage } from "@/lib/ai/types";

// Completes the first received data part into a concrete message (e.g. data-appendMessage).
export function useCompleteDataPart() {
  const { dataStream } = useDataStream();
  const { setMessages } = useChatActions<ChatMessage>();
  const storeApi = useChatStoreApi<ChatMessage>();

  useEffect(() => {
    if (!dataStream || dataStream.length === 0) {
      return;
    }

    const dataPart = dataStream[0];
    if (dataPart.type !== "data-appendMessage") {
      return;
    }

    const message = JSON.parse(dataPart.data) as ChatMessage;

    const currentMessages = storeApi.getState().messages as ChatMessage[];
    const existingIdx = currentMessages.findIndex((m) => m.id === message.id);

    // If it exists (often last due to partial placeholder), replace in place.
    if (existingIdx !== -1) {
      setMessages([
        ...currentMessages.slice(0, existingIdx),
        message,
        ...currentMessages.slice(existingIdx + 1),
      ]);
      return;
    }

    setMessages([...currentMessages, message]);
  }, [dataStream, setMessages, storeApi]);
}
