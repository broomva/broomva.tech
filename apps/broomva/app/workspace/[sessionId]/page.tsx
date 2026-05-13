import { SessionLensClient } from "@/components/lenses/session/SessionLensClient";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ seq?: string }>;
}

/**
 * Per-session page. Server Component reads `sessionId` from params and an
 * optional `?seq=N` cursor from searchParams, then hands off to the
 * Client Component that owns the SSE connection + Prosopon reducer.
 *
 * Note: the URL hash (`#seq=N`) the client writes after each event is
 * client-side only and cannot be read in a Server Component. The
 * `?seq=N` query string is supported as an SSR-friendly alternative
 * for direct-navigation resume; if absent we default to 0n and the
 * upstream replays from the beginning of the session.
 */
export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { sessionId } = await params;
  const { seq } = await searchParams;
  const initialSeq = ((): bigint => {
    if (!seq) return 0n;
    try {
      return BigInt(seq);
    } catch {
      return 0n;
    }
  })();
  return <SessionLensClient sid={sessionId} initialSeq={initialSeq} />;
}
