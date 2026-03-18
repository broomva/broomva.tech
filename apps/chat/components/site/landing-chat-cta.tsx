"use client";

import { useChatStatus } from "@ai-sdk-tools/store";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatRuntime } from "@/components/chat/chat-runtime";
import {
  ChatWelcomeFrame,
  ChatWelcomeHeading,
} from "@/components/chat/chat-welcome-frame";
import { ChatContent } from "@/components/chat/chat-content";
import { usePersistentChatSnapshot } from "@/lib/persistent-chat-snapshot";
import { useChatInput } from "@/providers/chat-input-provider";
import { useChatId } from "@/providers/chat-id-provider";
import { useSession } from "@/providers/session-provider";

function ActiveChatSurface({
  onClose,
  focusTick,
}: {
  onClose: () => void;
  focusTick: number;
}) {
  const { id } = useChatId();
  const status = useChatStatus();
  const { editorRef } = useChatInput();
  const snapshot = usePersistentChatSnapshot();
  const { data: session } = useSession();
  const workspaceHref =
    session?.user && snapshot?.chatId ? `/chat/${snapshot.chatId}` : "/chat";

  useEffect(() => {
    if (focusTick === 0) return;
    const t = window.setTimeout(() => editorRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [editorRef, focusTick]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end gap-2 px-2 pb-1 pt-2">
        <Link
          className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          href={workspaceHref}
        >
          Open workspace
        </Link>
        <button
          className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      <ChatContent
        chatId={id}
        className="min-h-0 flex-1"
        isReadonly={false}
        status={status}
      />
    </div>
  );
}

function PlaceholderInput({ onClick }: { onClick: () => void }) {
  return (
    <ChatWelcomeFrame className="min-h-[220px]">
      <div className="mb-6">
        <ChatWelcomeHeading />
      </div>

      <button
        className="group block w-full rounded-2xl border border-zinc-700 bg-black/60 p-3 text-left transition hover:border-emerald-300/50 hover:bg-black/80"
        onClick={onClick}
        type="button"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-zinc-400">
            Send a message...
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
            GPT-5 mini
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
            Tools
          </span>
        </div>
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {(["Write", "Learn", "Code", "Life stuff"] as const).map(
          (category) => (
            <button
              className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
              key={category}
              onClick={onClick}
              type="button"
            >
              {category}
            </button>
          )
        )}
      </div>
    </ChatWelcomeFrame>
  );
}

export function LandingChatCta() {
  const { id } = useChatId();
  const snapshot = usePersistentChatSnapshot();
  const [isActive, setIsActive] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  const initialMessages = useMemo(
    () => snapshot?.messages ?? [],
    [snapshot]
  );

  useEffect(() => {
    if (!isActive) return;

    function handleClick(e: MouseEvent) {
      if (sectionRef.current && !sectionRef.current.contains(e.target as Node)) {
        setIsActive(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isActive]);

  const activate = () => {
    setIsActive(true);
    setFocusTick((t) => t + 1);
  };

  if (snapshot === undefined) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-6">
        <PlaceholderInput onClick={() => {}} />
      </div>
    );
  }

  return (
    <>
      {isActive && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}

      <div
        className={[
          "relative rounded-3xl border border-zinc-800 bg-zinc-900/30 transition-shadow duration-300",
          isActive
            ? "z-50 shadow-[0_0_80px_rgba(16,185,129,0.12)]"
            : "",
        ].join(" ")}
        ref={sectionRef}
      >
        <motion.div
          animate={{
            height: isActive ? "min(65vh, 640px)" : "auto",
            padding: isActive ? "0px" : "16px",
          }}
          className="overflow-hidden sm:p-6"
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {isActive ? (
            <ChatRuntime
              id={id}
              initialMessages={initialMessages}
              isReadonly={false}
            >
              <ActiveChatSurface
                focusTick={focusTick}
                onClose={() => setIsActive(false)}
              />
            </ChatRuntime>
          ) : (
            <PlaceholderInput onClick={activate} />
          )}
        </motion.div>
      </div>
    </>
  );
}
