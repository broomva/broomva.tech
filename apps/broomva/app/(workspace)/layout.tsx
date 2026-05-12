import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell/WorkspaceShell";

export const metadata = {
  title: "Broomva · Workspace",
};

/**
 * Workspace route group layout. Mounts the persistent shell (top bar + rails
 * + dock + ⌘K palette) once; the active lens renders inside via {children}.
 *
 * URL surface (per north-star spec §5):
 *   /workspace                 — landing
 *   /workspace/[sessionId]     — session canvas (Session lens)
 *
 * Other primitives (Files, Agents, Memory, Operations, Policy) live as
 * lenses inside the shell, switched via the dock or ⌘K — never as routes.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
