"use client";

import { AnonymousSessionInit } from "@/components/anonymous-session-init";
import { ChatIdProvider } from "@/providers/chat-id-provider";

type ChatProvidersProps = {
  children: React.ReactNode;
};

export function ChatProviders({ children }: ChatProvidersProps) {
  return (
    <ChatIdProvider>
      <AnonymousSessionInit />
      {children}
    </ChatIdProvider>
  );
}
