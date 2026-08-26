import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell/WorkspaceShell";
import { getSafeSession } from "@/lib/auth";
import { requireCurrentLegalAcceptance } from "@/lib/legal-acceptance-gate";

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
export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user) redirect("/login");
  await requireCurrentLegalAcceptance(session.user.id);

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
