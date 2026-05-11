import { NextResponse } from "next/server";
import {
  incrementPromptCopyCount,
  getPromptBySlug,
} from "@/lib/db/queries";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { getSafeSession } from "@/lib/auth";
import { headers } from "next/headers";
import { logInvocation } from "@/lib/telemetry/log-invocation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Increment DB counter (best-effort — may fail for MDX-only prompts)
  let copyCount: number | null = null;
  try {
    const result = await incrementPromptCopyCount(slug);
    if (result) copyCount = result.copyCount;
  } catch {
    // MDX-only prompt or DB not ready — still track in PostHog
  }

  // Look up the prompt's version separately — incrementPromptCopyCount
  // only returns the copy count. MDX-only prompts return undefined here,
  // so we fall back to "unknown" to keep the column non-null.
  let promptVersion: string | undefined;
  try {
    const promptRow = await getPromptBySlug(slug);
    promptVersion = promptRow?.version ?? undefined;
  } catch {
    // DB not ready — fall through
  }

  // Resolve session (best-effort — anonymous users land in PostHog as
  // "anonymous" and on the invocation row with userId=null)
  let userId = "anonymous";
  let sessionUserId: string | null = null;
  try {
    const { data: session } = await getSafeSession({
      fetchOptions: { headers: await headers() },
    });
    if (session?.user?.id) {
      userId = session.user.id;
      sessionUserId = session.user.id;
    }
  } catch {
    // Not logged in — track as anonymous
  }

  // Write prompt_invocation row (source=web, status=completed). This is
  // best-effort: if the DB is down we still want the PostHog event and
  // the original response to succeed.
  try {
    await logInvocation({
      request,
      input: {
        prompt_slug: slug,
        prompt_version: promptVersion ?? "unknown",
        source: "web",
      },
      auth: sessionUserId
        ? { userId: sessionUserId, email: "" }
        : null,
    });
  } catch (error) {
    console.error("logInvocation failed in /copy:", error);
  }

  // Fire server-side PostHog event (preserved from the prior impl)
  captureServerEvent(userId, "prompt_copied", {
    prompt_slug: slug,
    copy_count: copyCount,
  });

  return NextResponse.json({ copyCount });
}
