"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Home, Sparkles, Layers, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Dock, DockIcon, DockItem, DockLabel } from "./dock";
import { ContentToolbar } from "./content-toolbar";
import { DockAudioControls } from "./dock-audio-controls";
import { DockSearch } from "./dock-search";
import { useToolbarDock } from "./toolbar-dock-context";
import { useAudioPlayback } from "@/providers/audio-playback-provider";

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
  const { track, state: audioState } = useAudioPlayback();

  const inChat = isInChatLayout(pathname);
  const links = allLinks.filter((link) => !link.chatOnly || inChat);

  const hasActiveAudio = !!track && audioState !== "idle";
  const showFullToolbar = isDocked && payload;
  const showDockAudio = hasActiveAudio && !showFullToolbar;
  const showMobileFloater = showFullToolbar || showDockAudio;

  return (
    <header className="pointer-events-none fixed bottom-4 left-0 right-0 z-40">
      {/* Mobile: playback / toolbar floats above the dock */}
      <AnimatePresence>
        {showMobileFloater && (
          <motion.div
            key="mobile-floater"
            className="pointer-events-auto mx-auto mb-2 flex w-fit items-center rounded-2xl border border-zinc-800/50 bg-zinc-900/80 px-4 py-2 backdrop-blur-md md:hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            {showFullToolbar ? (
              <ContentToolbar
                html={payload.html}
                title={payload.title}
                summary={payload.summary}
                slug={payload.slug}
                audioSrc={payload.audioSrc}
              />
            ) : (
              <DockAudioControls />
            )}
          </motion.div>
        )}
      </AnimatePresence>

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

          {/* Desktop: playback / toolbar inlined in the dock */}
          <AnimatePresence mode="wait">
            {showFullToolbar && (
              <motion.div
                key="full-toolbar"
                className="hidden items-center overflow-hidden pl-3 md:flex"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{
                  width: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.2, delay: 0.1 },
                }}
              >
                <div className="mr-3 h-5 w-px shrink-0 bg-zinc-700/50" />
                <ContentToolbar
                  html={payload.html}
                  title={payload.title}
                  summary={payload.summary}
                  slug={payload.slug}
                  audioSrc={payload.audioSrc}
                />
              </motion.div>
            )}
            {showDockAudio && (
              <motion.div
                key="dock-audio"
                className="hidden items-center overflow-hidden pl-3 md:flex"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{
                  width: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.2, delay: 0.08 },
                }}
              >
                <div className="mr-3 h-5 w-px shrink-0 bg-zinc-700/50" />
                <DockAudioControls />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center pl-1">
            <div className="mr-2 h-5 w-px shrink-0 bg-zinc-700/50" />
            <DockSearch />
          </div>
        </Dock>
      </nav>
    </header>
  );
}
