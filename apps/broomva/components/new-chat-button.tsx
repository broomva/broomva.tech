"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getNewChatShortcutText } from "@/components/keyboard-shortcuts";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { useChatId } from "@/providers/chat-id-provider";

export function NewChatButton() {
  const { setOpenMobile } = useSidebar();
  const { refreshChatID } = useChatId();
  const [shortcutText, setShortcutText] = useState("Ctrl+Shift+O");

  useEffect(() => {
    setShortcutText(getNewChatShortcutText());
  }, []);

  return (
    <SidebarMenuButton asChild className="mt-4" tooltip="New Chat">
      <Link
        className="flex w-full items-center gap-2"
        href="/"
        onClick={() => {
          setOpenMobile(false);
          refreshChatID();
        }}
      >
        <Plus aria-label="New Chat" size={16} />
        <span>New Chat</span>
        <span className="ml-auto text-muted-foreground text-xs">
          {shortcutText}
        </span>
      </Link>
    </SidebarMenuButton>
  );
}
