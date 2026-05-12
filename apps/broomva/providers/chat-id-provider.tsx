"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { generateUUID } from "@/lib/utils";
import {
  type ChatIdType,
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "./parse-chat-id-from-pathname";

type ChatIdContextType = {
  id: string;
  type: ChatIdType;
  source: ParsedChatIdFromPathname["source"];
  isPersisted: boolean;
  confirmChatId: (chatId: string) => void;
  refreshChatID: () => void;
};

const ChatIdContext = createContext<ChatIdContextType | undefined>(undefined);

export function ChatIdProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [{ provisionalChatId, confirmedChatId }, setChatIdState] = useState<{
    provisionalChatId: string;
    confirmedChatId: string | null;
  }>(() => ({
    provisionalChatId: generateUUID(),
    confirmedChatId: null,
  }));

  const resolvedId = useMemo(
    () => parseChatIdFromPathname(pathname),
    [pathname]
  );

  const confirmChatIdPersisted = useCallback(
    (chatId: string) => {
      if (chatId !== provisionalChatId) {
        console.error("Chat ID mismatch", chatId, provisionalChatId);
        throw new Error("Chat ID mismatch");
      }
      setChatIdState((prev) => ({ ...prev, confirmedChatId: chatId }));
    },
    [provisionalChatId]
  );

  const refreshChatID = useCallback(() => {
    const newId = generateUUID();
    setChatIdState({ provisionalChatId: newId, confirmedChatId: null });
    window.history.pushState(null, "", "/");
  }, []);

  const value = useMemo(
    () => ({
      id: resolvedId.id ?? provisionalChatId,
      type: resolvedId.type,
      source: resolvedId.source,
      isPersisted:
        (resolvedId.id !== null && resolvedId.id !== provisionalChatId) ||
        confirmedChatId === provisionalChatId,
      confirmChatId: confirmChatIdPersisted,
      refreshChatID,
    }),
    [
      resolvedId.id,
      resolvedId.type,
      resolvedId.source,
      provisionalChatId,
      confirmedChatId,
      confirmChatIdPersisted,
      refreshChatID,
    ]
  );

  return (
    <ChatIdContext.Provider value={value}>{children}</ChatIdContext.Provider>
  );
}

export function useChatId() {
  const context = useContext(ChatIdContext);
  if (context === undefined) {
    throw new Error("useChatId must be used within a ChatIdProvider");
  }
  return context;
}
