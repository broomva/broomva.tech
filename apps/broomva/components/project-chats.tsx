"use client";

import { ProjectChatItem } from "@/components/project-chat-item";
import { Separator } from "@/components/ui/separator";
import type { UIChat } from "@/lib/types/ui-chat";

export function ProjectChats({
  chats,
  onDelete,
  onRename,
}: {
  chats: UIChat[] | undefined;
  onDelete: (chatId: string) => void;
  onRename: (chatId: string, title: string) => Promise<void>;
}) {
  if (!chats) {
    return null;
  }

  if (chats.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 px-4 py-6">
        <p className="font-medium text-foreground text-sm">
          No chats in this project
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          Start a chat to keep conversations organized and re-use project
          knowledge.
        </p>
      </div>
    );
  }

  return (
    <div>
      {chats.map((chat, index) => (
        <div key={chat.id}>
          {index > 0 && <Separator />}
          <ProjectChatItem
            chat={chat}
            onDelete={onDelete}
            onRename={onRename}
          />
        </div>
      ))}
    </div>
  );
}
