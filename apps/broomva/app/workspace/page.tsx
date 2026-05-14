import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { getWorkspaceId } from "@/lib/workspace/identity";

/**
 * /workspace landing. Resolves the logged-in user's stable workspace_id
 * (deterministic hash of Better Auth userId) and redirects to
 * `/workspace/<workspace_id>`. Same user always lands on the same URL —
 * refresh stays on the same workspace, the welcome arc plays once per
 * process lifetime (idempotent seed guard), subsequent connects replay
 * the in-process buffer.
 *
 * If the user isn't logged in, redirect to the marketing home with a
 * `?next=/workspace` continuation. (There is no `/login` route in this
 * app yet — Better Auth flows go through `/` and modal-driven sign-in.
 * Plan E formalizes the gated entry point.)
 *
 * Touching `headers()` first opts the route out of prerendering — same
 * pattern as Plan C, required by Next 16 + cacheComponents for any
 * Server Component that derives state from the request.
 */
export default async function WorkspaceLandingPage(): Promise<never> {
  const h = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: h },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/?next=/workspace");
  }
  const workspaceId = getWorkspaceId(userId);
  redirect(`/workspace/${workspaceId}`);
}
