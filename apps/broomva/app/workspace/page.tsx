import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * /workspace landing. Bootstraps a fresh session by minting a new UUID
 * and redirecting to `/workspace/<sid>`. The session-runtime materializes
 * that sid the first time it's streamed, emits Broomva's welcome arc
 * (prose intro → fs.write welcome.md → prose follow-up), and the user
 * lands on the Session lens with content already flowing.
 *
 * Next 16 + cacheComponents treats `crypto.randomUUID()` as cacheable by
 * default in Server Components and would prerender a static UUID — which
 * defeats the bootstrap (every visitor would land on the same sid).
 * Touching `headers()` first opts the route out of prerendering, marking
 * it as dynamic so each request gets a fresh UUID.
 *
 * Session continuity (re-attaching to a most-recent session per the parent
 * spec's `Identity.ListSessions` step) is deferred until the lifegw
 * Identity RPC ships. v1 always opens a new session, which is the honest
 * stub — `/workspace` is a "begin" gate, not a directory.
 */
export default async function WorkspaceLandingPage(): Promise<never> {
  await headers();
  const sid = crypto.randomUUID();
  redirect(`/workspace/${sid}`);
}
