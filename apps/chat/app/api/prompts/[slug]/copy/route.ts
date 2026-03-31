import { NextResponse } from "next/server";
import { incrementPromptCopyCount } from "@/lib/db/queries";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { getSafeSession } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST(
  _request: Request,
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

  // Fire server-side PostHog event
  let userId = "anonymous";
  try {
    const { data: session } = await getSafeSession({
      fetchOptions: { headers: await headers() },
    });
    if (session?.user?.id) userId = session.user.id;
  } catch {
    // Not logged in — track as anonymous
  }

  captureServerEvent(userId, "prompt_copied", {
    prompt_slug: slug,
    copy_count: copyCount,
  });

  return NextResponse.json({ copyCount });
}
