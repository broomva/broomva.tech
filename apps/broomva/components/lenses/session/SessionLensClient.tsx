"use client";

import { ApprovalDrawer } from "./ApprovalDrawer";
import { Composer } from "./Composer";
import { SceneContextProvider } from "./SceneContext";
import { SessionCanvas } from "./SessionCanvas";
import { SessionHeader } from "./SessionHeader";
import { useSessionStream } from "./useSessionStream";

interface Props {
  sid: string;
  initialSeq: bigint;
}

/**
 * Top-level Client Component for the Session lens.
 *
 * Owns the SSE connection (via `useSessionStream`), the scene reducer
 * (`applyEvent` inside the hook), and provides `SceneContext` to the
 * subtree so SessionHeader / SessionCanvas / Composer can read scene
 * state without prop-drilling.
 *
 * Layout is a vertical flex column filling the lens slot: header on top,
 * canvas in the middle (flex-1 → scrollable), composer pinned to the
 * bottom, ApprovalDrawer rendered as a layout-only slot (no-op in B-4a,
 * activates in B-4b).
 */
export function SessionLensClient({ sid, initialSeq }: Props) {
  const stream = useSessionStream({ sid, initialSeq });
  return (
    <SceneContextProvider value={stream}>
      <div className="flex h-full flex-col">
        <SessionHeader sid={sid} />
        <SessionCanvas sid={sid} />
        <Composer sid={sid} />
        <ApprovalDrawer />
      </div>
    </SceneContextProvider>
  );
}
