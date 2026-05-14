import { FilesLens } from "@/components/lenses/files/FilesLens";
import { SessionLensClient } from "@/components/lenses/session/SessionLensClient";
import { WorkspaceSession } from "@/components/lenses/session/WorkspaceSession";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ seq?: string; file?: string }>;
}

/**
 * Per-session page. Server Component reads `sessionId`, an optional
 * `?seq=N` resume cursor, and an optional `?file=<path>` Files-lens
 * activation token from searchParams, then hands off to the wrapper
 * + lens combination.
 *
 * The `?file=` param is the activation contract for the Files lens:
 *   /workspace/[sid]                       → Session lens (chat canvas)
 *   /workspace/[sid]?file=welcome.md       → Files lens (viewer + outline + backlinks)
 *
 * Both lenses share a single SSE stream + SceneContextProvider mounted
 * in `WorkspaceSession`.
 */
export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { sessionId } = await params;
  const { seq, file } = await searchParams;
  const initialSeq = ((): bigint => {
    if (!seq) return 0n;
    try {
      return BigInt(seq);
    } catch {
      return 0n;
    }
  })();
  return (
    <WorkspaceSession sid={sessionId} initialSeq={initialSeq}>
      {file ? <FilesLens file={file} /> : <SessionLensClient sid={sessionId} />}
    </WorkspaceSession>
  );
}
