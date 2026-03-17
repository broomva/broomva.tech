"use client";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { UiToolName } from "@/lib/ai/types";
import { useChatId } from "@/providers/chat-id-provider";
import { useChatInput } from "@/providers/chat-input-provider";
import { useSession } from "@/providers/session-provider";
import { artifactDefinitions } from "./artifact-panel";
import { useDataStream } from "./data-stream-provider";

function handleResearchUpdate({
  delta,
  setSelectedTool,
}: {
  delta: any;
  setSelectedTool: Dispatch<SetStateAction<UiToolName | null>>;
}): void {
  if (delta.type === "data-researchUpdate") {
    // TODO: fix this type
    const update: any = (delta as any).data;
    if (update?.type === "completed") {
      setSelectedTool((current) =>
        current === "deepResearch" ? null : current
      );
    }
  }
}

/**
 * Process artifact stream parts (e.g., data-suggestion for text artifacts).
 * Dispatches to artifact-specific onStreamPart handlers.
 */
function processArtifactStreamPart({
  delta,
  artifact,
  setArtifact,
  setMetadata,
}: {
  delta: any;
  artifact: ReturnType<typeof useArtifact>["artifact"];
  setArtifact: ReturnType<typeof useArtifact>["setArtifact"];
  setMetadata: ReturnType<typeof useArtifact>["setMetadata"];
}): void {
  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (artifactDefinition?.onStreamPart) {
    artifactDefinition.onStreamPart({
      streamPart: delta,
      setArtifact,
      setMetadata,
    });
  }
}

export function DataStreamHandler({ id }: { id: string }) {
  const { dataStream } = useDataStream();
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);
  const { data: session } = useSession();
  const { setSelectedTool } = useChatInput();
  const { confirmChatId } = useChatId();
  const isAuthenticated = !!session;

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    for (const delta of newDeltas) {
      if (
        delta.type === "data-chatConfirmed" &&
        isAuthenticated &&
        id === delta.data.chatId
      ) {
        confirmChatId(delta.data.chatId);
      }

      handleResearchUpdate({ delta, setSelectedTool });

      processArtifactStreamPart({
        delta,
        artifact,
        setArtifact,
        setMetadata,
      });
    }
  }, [
    dataStream,
    setArtifact,
    setMetadata,
    artifact,
    isAuthenticated,
    setSelectedTool,
    confirmChatId,
    id,
  ]);

  return null;
}
