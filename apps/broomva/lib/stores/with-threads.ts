"use client";

// Middleware that extends @ai-sdk-tools/store with thread epoch tracking
// and complete message tree management for branching/sibling navigation.
// The store owns allMessages (the full tree); React Query feeds data into it.

import type { StoreState as BaseChatStoreState } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import type { StateCreator } from "zustand";
import type { MessageNode } from "@/lib/thread-utils";
import {
  buildChildrenMap,
  buildThreadFromLeaf,
  findLeafDfsToRightFromMessageId,
} from "@/lib/thread-utils";

export type MessageSiblingInfo<UM> = {
  siblings: UM[];
  siblingIndex: number;
};

export type ThreadAugmentedState<UM extends UIMessage> =
  BaseChatStoreState<UM> & {
    threadEpoch: number;
    /**
     * Snapshot of the currently-active thread to use as "initial messages" for
     * useChat on remounts. Intentionally NOT kept in sync with live messages;
     * only updated when switching threads (setMessagesWithEpoch) and on store init.
     */
    threadInitialMessages: UM[];
    /** Complete message tree (all branches). Source of truth for sibling navigation. */
    allMessages: UM[];
    /** Parent→children mapping, rebuilt when allMessages changes. */
    childrenMap: Map<string | null, UM[]>;
    bumpThreadEpoch: () => void;
    resetThreadEpoch: () => void;
    setMessagesWithEpoch: (messages: UM[]) => void;
    /** Replace the full message tree (used when syncing from server). */
    setAllMessages: (messages: UM[]) => void;
    /** Add or replace a single message in the tree (used during streaming/sending). */
    addMessageToTree: (message: UM) => void;
    /** Look up sibling info for a message. */
    getMessageSiblingInfo: (messageId: string) => MessageSiblingInfo<UM> | null;
    /**
     * Switch to a sibling thread. Returns the new thread array,
     * or null if no switch was possible.
     */
    switchToSibling: (
      messageId: string,
      direction: "prev" | "next"
    ) => UM[] | null;
  };

export const withThreads =
  <UI_MESSAGE extends UIMessage, T extends BaseChatStoreState<UI_MESSAGE>>(
    creator: StateCreator<T, [], []>
  ): StateCreator<T & ThreadAugmentedState<UI_MESSAGE>, [], []> =>
  (set, get, api) => {
    const base = creator(set, get, api);

    // Wrap the original setMessages to auto-bump epoch
    const originalSetMessages = base.setMessages;

    const rebuildMap = (msgs: UI_MESSAGE[]) =>
      buildChildrenMap(msgs as (UI_MESSAGE & MessageNode)[]);

    return {
      ...base,
      threadEpoch: 0,
      threadInitialMessages: base.messages,
      allMessages: base.messages,
      childrenMap: rebuildMap(base.messages),

      bumpThreadEpoch: () => {
        set((state) => ({
          ...state,
          threadEpoch: state.threadEpoch + 1,
        }));
      },

      resetThreadEpoch: () => {
        set((state) => ({
          ...state,
          threadEpoch: 0,
          threadInitialMessages: get().messages,
        }));
      },

      setMessagesWithEpoch: (messages: UI_MESSAGE[]) => {
        originalSetMessages(messages);
        set((state) => ({
          ...state,
          threadEpoch: state.threadEpoch + 1,
          threadInitialMessages: messages,
        }));
      },

      setAllMessages: (messages: UI_MESSAGE[]) => {
        set((state) => ({
          ...state,
          allMessages: messages,
          childrenMap: rebuildMap(messages),
        }));
      },

      addMessageToTree: (message: UI_MESSAGE) => {
        set((state) => {
          const idx = state.allMessages.findIndex((m) => m.id === message.id);
          let next: UI_MESSAGE[];
          if (idx !== -1) {
            next = [...state.allMessages];
            next[idx] = message;
          } else {
            next = [...state.allMessages, message];
          }
          return { ...state, allMessages: next, childrenMap: rebuildMap(next) };
        });
      },

      getMessageSiblingInfo: (
        messageId: string
      ): MessageSiblingInfo<UI_MESSAGE> | null => {
        const { allMessages, childrenMap } = get();
        const message = allMessages.find((m) => m.id === messageId);
        if (!message) {
          return null;
        }

        const parentId =
          (message as UI_MESSAGE & MessageNode).metadata?.parentMessageId ||
          null;
        const siblings = (childrenMap.get(parentId) ?? []) as UI_MESSAGE[];
        const siblingIndex = siblings.findIndex((s) => s.id === messageId);

        return { siblings, siblingIndex };
      },

      switchToSibling: (
        messageId: string,
        direction: "prev" | "next"
      ): UI_MESSAGE[] | null => {
        const state = get();
        const { allMessages, childrenMap } = state;
        if (!allMessages.length) {
          return null;
        }

        const siblingInfo = state.getMessageSiblingInfo(messageId);
        if (!siblingInfo || siblingInfo.siblings.length <= 1) {
          return null;
        }

        const { siblings, siblingIndex } = siblingInfo;
        const nextIndex =
          direction === "next"
            ? (siblingIndex + 1) % siblings.length
            : (siblingIndex - 1 + siblings.length) % siblings.length;

        const targetSibling = siblings[nextIndex];
        const leaf = findLeafDfsToRightFromMessageId(
          childrenMap as Map<string | null, (UI_MESSAGE & MessageNode)[]>,
          targetSibling.id
        );
        const newThread = buildThreadFromLeaf(
          allMessages as (UI_MESSAGE & MessageNode)[],
          leaf ? leaf.id : targetSibling.id
        ) as UI_MESSAGE[];

        state.setMessagesWithEpoch(newThread);
        return newThread;
      },

      // Override setMessages to auto-bump epoch when thread changes
      setMessages: (messages: UI_MESSAGE[]) => {
        const currentMessages = get().messages;
        const currentIds = currentMessages.map((m) => m.id).join(",");
        const newIds = messages.map((m) => m.id).join(",");

        originalSetMessages(messages);

        // Only bump epoch if the thread structure actually changed
        if (currentIds !== newIds) {
          set((state) => ({
            ...state,
            threadEpoch: state.threadEpoch + 1,
          }));
        }
      },
    };
  };
