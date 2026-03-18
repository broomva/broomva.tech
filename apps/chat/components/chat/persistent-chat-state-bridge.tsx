"use client";

import { useEffect } from "react";
import { writePersistentChatSnapshot } from "@/lib/persistent-chat-snapshot";
import { useMessages } from "@/lib/stores/hooks-base";

export function PersistentChatStateBridge({ chatId }: { chatId: string }) {
  const messages = useMessages();

  useEffect(() => {
    writePersistentChatSnapshot({
      chatId,
      messages,
      updatedAt: new Date().toISOString(),
    });
  }, [chatId, messages]);

  return null;
}
