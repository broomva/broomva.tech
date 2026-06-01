import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DocFrame } from "@/components/spec-doc/doc-frame";
import { getSafeSession } from "@/lib/auth";
import { resolveSpecDocForViewer } from "@/lib/db/spec-doc-queries";

/**
 * /d/[ref]/v/[version] — gated viewer pinned to a specific version of a handle.
 * Same gate as the latest-version route.
 */
export default async function PinnedDocViewerPage({
  params,
}: {
  params: Promise<{ ref: string; version: string }>;
}) {
  const { ref, version } = await params;
  const v = Number.parseInt(version, 10);

  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/d/${ref}/v/${version}`)}`);
  }

  if (!Number.isInteger(v) || v < 1) {
    notFound();
  }

  const doc = await resolveSpecDocForViewer(ref, userId, v);
  if (!doc) {
    notFound();
  }

  return <DocFrame doc={doc} pinnedVersion={v} />;
}
