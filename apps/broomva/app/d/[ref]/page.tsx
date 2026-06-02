import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DocFrame } from "@/components/spec-doc/doc-frame";
import { getSafeSession } from "@/lib/auth";
import { resolveSpecDocForViewer } from "@/lib/db/spec-doc-queries";

/**
 * /d/[ref] — gated viewer for the LATEST version of a doc. `ref` is a stable
 * handle (or a legacy/standalone id). Logged-out → /login; a doc that isn't the
 * session user's (or doesn't exist) → 404 (no existence leak).
 */
export default async function DocViewerPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/d/${ref}`)}`);
  }

  const doc = await resolveSpecDocForViewer(ref, userId);
  if (!doc) {
    notFound();
  }

  return <DocFrame doc={doc} />;
}
