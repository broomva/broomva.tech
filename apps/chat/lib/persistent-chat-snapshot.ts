"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";

const ACTIVE_CHAT_SNAPSHOT_KEY = "active-chat-snapshot:v1";

export type PersistentChatSnapshot = {
  chatId: string;
  messages: ChatMessage[];
  updatedAt: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function readPersistentChatSnapshot(): PersistentChatSnapshot | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CHAT_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistentChatSnapshot;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.chatId !== "string" ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writePersistentChatSnapshot(snapshot: PersistentChatSnapshot) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      ACTIVE_CHAT_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore storage failures.
  }
}

export function clearPersistentChatSnapshot() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(ACTIVE_CHAT_SNAPSHOT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function usePersistentChatSnapshot() {
  const [snapshot, setSnapshot] = useState<
    PersistentChatSnapshot | null | undefined
  >(undefined);

  useEffect(() => {
    setSnapshot(readPersistentChatSnapshot());
  }, []);

  return snapshot;
}
