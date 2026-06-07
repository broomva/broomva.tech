import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import { notFound } from "next/navigation";
import { PublicArtifactShell } from "@/components/public-artifact/public-artifact-shell";
import { config } from "@/lib/config";
import { resolvePublicHandoff } from "@/lib/db/handoff-queries";

export const metadata: Metadata = {
  title: "Shared handoff · broomva",
  robots: { index: false, follow: false },
};

/**
 * /h/[ref] — public handoff content only. This route deliberately avoids
 * rendering the private Maestro queue, its stream, or any queue controls.
 */
export default async function PublicHandoffPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const handoff = await resolvePublicHandoff(ref);
  if (!handoff) notFound();

  const publicUrl = `${config.appUrl.replace(/\/+$/, "")}/h/${handoff.id}`;

  return (
    <PublicArtifactShell
      kind="Handoff"
      title={handoff.title}
      version={handoff.version}
      sharedAt={handoff.publicAt}
      sourcePath={handoff.sourcePath}
      relatedSpecs={handoff.specRefs ?? []}
      publicUrl={publicUrl}
    >
      {handoff.tldr ? (
        <p className="mb-5 max-w-3xl text-muted-foreground text-sm leading-6">
          {handoff.tldr}
        </p>
      ) : null}
      <div className="prose prose-invert max-w-none rounded-xl border border-border/70 bg-bg-surface/35 px-5 py-4 prose-headings:font-semibold prose-a:text-[color:var(--ag-ai-blue)] prose-code:text-[color:var(--ag-accent-blue)] sm:px-7 sm:py-6">
        <ReactMarkdown>{handoff.body}</ReactMarkdown>
      </div>
    </PublicArtifactShell>
  );
}
