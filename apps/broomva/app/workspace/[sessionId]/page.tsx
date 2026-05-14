import { AgentsLens } from "@/components/lenses/agents/AgentsLens";
import { FilesLens } from "@/components/lenses/files/FilesLens";
import { SessionLensClient } from "@/components/lenses/session/SessionLensClient";
import { WorkspaceSession } from "@/components/lenses/session/WorkspaceSession";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ seq?: string; file?: string; lens?: string }>;
}

/**
 * Per-session page. Three lens branches driven by searchParams:
 *
 *   /workspace/[sid]                          → Session lens (chat canvas)
 *   /workspace/[sid]?file=<path>              → Files lens
 *   /workspace/[sid]?lens=agents              → Agents lens (gallery)
 *
 * All three share the WorkspaceSession wrapper, which owns the SSE
 * stream + SceneContextProvider so the scene is consistent across lens
 * switches without re-subscribing.
 */
export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { sessionId } = await params;
  const { seq, file, lens } = await searchParams;
  const initialSeq = ((): bigint => {
    if (!seq) return 0n;
    try {
      return BigInt(seq);
    } catch {
      return 0n;
    }
  })();
  const body = file ? (
    <FilesLens file={file} />
  ) : lens === "agents" ? (
    <AgentsLens />
  ) : (
    <SessionLensClient sid={sessionId} />
  );
  return (
    <WorkspaceSession sid={sessionId} initialSeq={initialSeq}>
      {body}
    </WorkspaceSession>
  );
}
