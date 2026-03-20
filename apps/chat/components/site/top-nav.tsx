"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, Layers, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Dock, DockIcon, DockItem, DockLabel } from "./dock";
import { ContentToolbar } from "./content-toolbar";
import { useToolbarDock } from "./toolbar-dock-context";

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
  const { isDocked, payload } = useToolbarDock();

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

          <AnimatePresence>
            {isDocked && payload && (
              <motion.div
                className="flex items-center overflow-hidden border-l border-zinc-700/50 pl-3"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{
                  width: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.2, delay: 0.1 },
                }}
              >
                <ContentToolbar
                  html={payload.html}
                  title={payload.title}
                  summary={payload.summary}
                  slug={payload.slug}
                  audioSrc={payload.audioSrc}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Dock>
      </nav>
    </header>
  );
}
