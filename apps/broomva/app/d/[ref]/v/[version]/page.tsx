import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicArtifactShell } from "@/components/public-artifact/public-artifact-shell";
import { PublicSpecFrame } from "@/components/public-artifact/public-spec-frame";
import { DocFrame } from "@/components/spec-doc/doc-frame";
import { getSafeSession } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  resolvePublicSpecDoc,
  resolveSpecDocForViewer,
} from "@/lib/db/spec-doc-queries";

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
  if (!Number.isInteger(v) || v < 1) {
    notFound();
  }

  if (userId) {
    const owned = await resolveSpecDocForViewer(ref, userId, v);
    if (owned) {
      return <DocFrame doc={owned} pinnedVersion={v} />;
    }
  }

  const doc = await resolvePublicSpecDoc(ref, v);
  if (!doc) notFound();

  const publicUrl = `${config.appUrl.replace(/\/+$/, "")}/d/${doc.id}/v/${v}`;
  return (
    <PublicArtifactShell
      kind="Spec"
      title={doc.title}
      version={doc.version}
      sharedAt={doc.publicAt}
      sourcePath={doc.sourcePath}
      publicUrl={publicUrl}
    >
      <PublicSpecFrame title={doc.title} html={doc.html} />
    </PublicArtifactShell>
  );
}
