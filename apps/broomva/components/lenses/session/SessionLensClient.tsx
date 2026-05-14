"use client";

import { ApprovalDrawer } from "./ApprovalDrawer";
import { Composer } from "./Composer";
import { SessionCanvas } from "./SessionCanvas";
import { SessionHeader } from "./SessionHeader";

interface Props {
  sid: string;
}

/**
 * Session lens body — header + canvas + composer + approval tray. The SSE
 * stream and SceneContextProvider live in the parent `WorkspaceSession`
 * wrapper so both Session and Files lenses share one scene.
 */
export function SessionLensClient({ sid }: Props) {
  return (
    <div className="flex h-full flex-col">
      <SessionHeader sid={sid} />
      <SessionCanvas sid={sid} />
      <Composer sid={sid} />
      <ApprovalDrawer />
    </div>
  );
}
