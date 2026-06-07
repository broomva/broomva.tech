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
 * /d/[ref] — owner viewer for private docs and public content viewer for shared
 * docs. Private docs still never leak: anonymous / non-owner requests only
 * resolve rows explicitly marked visibility=public.
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
  if (userId) {
    const owned = await resolveSpecDocForViewer(ref, userId);
    if (owned) {
      return <DocFrame doc={owned} />;
    }
  }

  const doc = await resolvePublicSpecDoc(ref);
  if (!doc) notFound();

  const publicUrl = `${config.appUrl.replace(/\/+$/, "")}/d/${doc.id}`;
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
