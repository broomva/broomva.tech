"use client";

import { ChatHeader } from "@/components/chat-header";
import { useMessageIds } from "@/lib/stores/hooks-base";
import { useSession } from "@/providers/session-provider";
import { ChatContent } from "./chat-content";

export function MainChatPanel({
  chatId,
  projectId,
  isReadonly,
  className,
}: {
  chatId: string;
  projectId?: string;
  isReadonly: boolean;
  className?: string;
}) {
  const { data: session } = useSession();
  const messageIds = useMessageIds() as string[];
  const hasMessages = messageIds.length > 0;

  return (
    <div className={className}>
      <ChatHeader
        chatId={chatId}
        className={"h-(--header-height)"}
        hasMessages={hasMessages}
        isReadonly={isReadonly}
        projectId={projectId}
        user={session?.user}
      />

      <ChatContent
        chatId={chatId}
        className="h-[calc(100dvh_-_var(--header-height))]"
        isReadonly={isReadonly}
        projectId={projectId}
      />
    </div>
  );
}
