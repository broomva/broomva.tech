"use client";

import { useChatReset } from "@ai-sdk-tools/store";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage } from "@/lib/ai/types";
import {
  useResetThreadEpoch,
  useSetAllMessages,
} from "@/lib/stores/hooks-threads";
import { useTRPC } from "@/trpc/react";
import { useChatId } from "../providers/chat-id-provider";

/**
 * Renderless component that syncs the server's message tree into the Zustand
 * store and handles home-page reset. Tree logic (sibling info, thread
 * switching) lives in the store (with-threads middleware).
 */
export function MessageTreeSync() {
  const { id, isPersisted, source } = useChatId();
  const isShared = source === "share";
  const pathname = usePathname();
  const trpc = useTRPC();
  const reset = useChatReset();
  const { setDataStream } = useDataStream();
  const resetThreadEpoch = useResetThreadEpoch();
  const setAllMessages = useSetAllMessages();

  // React Query fetches the full tree from the server and feeds it into the store
  const messagesQuery = useQuery({
    ...(isShared
      ? trpc.chat.getPublicChatMessages.queryOptions({ chatId: id })
      : trpc.chat.getChatMessages.queryOptions({ chatId: id })),
    enabled: !!id && isPersisted && pathname !== "/",
  });

  // Sync server data → store whenever React Query resolves
  useEffect(() => {
    if (messagesQuery.data) {
      setAllMessages(messagesQuery.data as ChatMessage[]);
    }
  }, [messagesQuery.data, setAllMessages]);

  useEffect(() => {
    if (!isPersisted && pathname === "/") {
      reset();
      setDataStream([]);
      resetThreadEpoch();
    }
  }, [isPersisted, pathname, reset, setDataStream, resetThreadEpoch]);

  return null;
}
