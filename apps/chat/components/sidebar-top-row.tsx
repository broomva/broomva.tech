"use client";

import Image from "next/image";
import Link from "next/link";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { useSidebar } from "@/components/ui/sidebar";
import { config } from "@/lib/config";
import { useChatId } from "@/providers/chat-id-provider";

export function SidebarTopRow() {
  const { setOpenMobile, open, openMobile } = useSidebar();
  const { refreshChatID } = useChatId();
  const isExpanded = open || openMobile;

  return (
    <div
      className={`flex w-full items-center ${
        isExpanded ? "justify-between gap-2" : "justify-start"
      }`}
    >
      {isExpanded ? (
        <Link
          className="flex flex-row items-center gap-2"
          href="/"
          onClick={() => {
            setOpenMobile(false);
            refreshChatID();
          }}
        >
          <span className="flex cursor-pointer items-center gap-2 rounded-md p-1 font-semibold text-lg hover:bg-muted">
            <Image
              alt={config.appName}
              className="h-6 w-6"
              height={24}
              src="/icon.svg"
              width={24}
            />
            {config.appName}
          </span>
        </Link>
      ) : null}
      <SidebarToggle className="md:h-fit md:px-2" />
    </div>
  );
}
