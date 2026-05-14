"use client";

import type { ReactNode } from "react";
import { SceneContextProvider } from "./SceneContext";
import { useSessionStream } from "./useSessionStream";

interface Props {
  sid: string;
  initialSeq: bigint;
  children: ReactNode;
}

/**
 * Owns the SSE connection + scene reducer for a workspace session, then
 * provides the SceneContext to its subtree. Both the Session lens (chat
 * canvas + composer) and the Files lens (tree + viewer + right-rail
 * outline) render under this wrapper so they share a single live scene.
 *
 * Activation is driven entirely by the URL: `?file=<path>` ⇒ FilesLens;
 * absent ⇒ SessionLensClient. The wrapper itself is lens-agnostic.
 */
export function WorkspaceSession({ sid, initialSeq, children }: Props) {
  const stream = useSessionStream({ sid, initialSeq });
  return <SceneContextProvider value={stream}>{children}</SceneContextProvider>;
}
