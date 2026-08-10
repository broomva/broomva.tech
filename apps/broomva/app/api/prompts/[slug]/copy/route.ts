import { NextResponse } from "next/server";
import {
  incrementPromptCopyCount,
  getPromptBySlug,
} from "@/lib/db/queries";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { logInvocation } from "@/lib/telemetry/log-invocation";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json(
      { error: "Current legal acceptance required" },
      { status: 403 },
    );
  }

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

  const userId = auth.userId;

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
        caller: request.headers.get("user-agent")?.slice(0, 128) ?? undefined,
      },
      auth,
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
