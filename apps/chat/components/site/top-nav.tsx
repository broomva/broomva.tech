"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, Layers, MessageCircle } from "lucide-react";
import { Dock, DockIcon, DockItem, DockLabel } from "./dock";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/prompts", label: "Prompts", icon: Sparkles },
  { href: "/skills", label: "Skills", icon: Layers },
  { href: "/chat", label: "Chat", icon: MessageCircle },
];

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

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
