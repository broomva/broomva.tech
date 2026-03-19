"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, Layers, MessageCircle } from "lucide-react";
import { Dock, DockIcon, DockItem, DockLabel } from "./dock";

const allLinks = [
  { href: "/", label: "Home", icon: Home, chatOnly: true },
  { href: "/prompts", label: "Prompts", icon: Sparkles, chatOnly: false },
  { href: "/skills", label: "Skills", icon: Layers, chatOnly: false },
  { href: "/chat", label: "Chat", icon: MessageCircle, chatOnly: false },
];

const chatRoutes = ["/chat", "/project", "/settings"];

function isInChatLayout(pathname: string): boolean {
  return chatRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const inChat = isInChatLayout(pathname);
  const links = allLinks.filter((link) => !link.chatOnly || inChat);

  return (
    <header className="pointer-events-none fixed bottom-4 left-0 right-0 z-40">
      <nav aria-label="Main navigation">
        <Dock
          magnification={60}
          distance={120}
          panelHeight={48}
          className="gap-3 px-3"
        >
          {links.map((link) => {
            const active = isCurrent(pathname, link.href);
            const Icon = link.icon;
            return (
              <DockItem
                key={link.href}
                onClick={() => router.push(link.href as Route)}
                className="cursor-pointer"
              >
                <DockLabel>{link.label}</DockLabel>
                <DockIcon>
                  <Icon
                    className={
                      active
                        ? "text-ai-blue"
                        : "text-zinc-400 transition-colors group-hover:text-text-primary"
                    }
                    strokeWidth={active ? 2.5 : 1.5}
                  />
                </DockIcon>
              </DockItem>
            );
          })}
        </Dock>
      </nav>
    </header>
  );
}
