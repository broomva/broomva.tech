import { useChatActions } from "@ai-sdk-tools/store";
import { useCallback } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import { useArtifact } from "@/hooks/use-artifact";
import type { ChatMessage } from "@/lib/ai/types";
import { useSwitchToSibling } from "@/lib/stores/hooks-threads";

/**
 * Navigate to a sibling thread with side effects (stop stream, close artifact).
 * Uses the store's switchToSibling for the pure state transition.
 */
export function useNavigateToSibling() {
  const { stop } = useChatActions<ChatMessage>();
  const { setDataStream } = useDataStream();
  const { artifact, closeArtifact } = useArtifact();
  const switchToSibling = useSwitchToSibling();

  return useCallback(
    (messageId: string, direction: "prev" | "next") => {
      // Hard-disconnect the current stream + clear buffered deltas
      stop?.();
      setDataStream([]);

      const newThread = switchToSibling(messageId, direction);

      // Close artifact if its message is not in the new thread
      if (
        newThread &&
        artifact.isVisible &&
        artifact.messageId &&
        !newThread.some((m) => m.id === artifact.messageId)
      ) {
        closeArtifact();
      }
    },
    [
      artifact.isVisible,
      artifact.messageId,
      closeArtifact,
      setDataStream,
      stop,
      switchToSibling,
    ]
  );
}
