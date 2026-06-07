import type { Route } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/site-header";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { TopNav } from "@/components/site/top-nav";
import { CopyLinkButton } from "./copy-link-button";

export type PublicArtifactKind = "Spec" | "Handoff";

export function PublicArtifactShell({
  kind,
  title,
  version,
  sharedAt,
  sourcePath,
  relatedSpecs = [],
  publicUrl,
  children,
}: {
  kind: PublicArtifactKind;
  title: string;
  version: number;
  sharedAt: Date | null;
  sourcePath?: string | null;
  relatedSpecs?: string[];
  publicUrl: string;
  children: React.ReactNode;
}) {
  const shared = sharedAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(sharedAt)
    : null;

  return (
    <ToolbarDockProvider>
      <div className="flex min-h-screen flex-col bg-bg-deep pt-16 text-text-primary">
        <SiteHeader />
        <main className="flex-1 pb-24">
          <article className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
            <header className="mb-5 border-border/60 border-b pb-4">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <span className="rounded-full border border-[color:var(--ag-ai-blue)]/40 px-2 py-0.5 text-[color:var(--ag-ai-blue)]">
                  {kind}
                </span>
                <span>v{version}</span>
                {shared ? <span>Shared {shared}</span> : null}
                {sourcePath ? (
                  <span className="max-w-full truncate sm:max-w-[34rem]">
                    {sourcePath}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h1 className="max-w-4xl font-semibold text-2xl leading-tight sm:text-3xl">
                  {title}
                </h1>
                <CopyLinkButton url={publicUrl} />
              </div>
              {relatedSpecs.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {relatedSpecs.map((ref) => (
                    <Link
                      key={ref}
                      href={`/d/${ref}` as Route}
                      className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:border-[color:var(--ag-ai-blue)]/40 hover:text-foreground"
                    >
                      /d/{ref}
                    </Link>
                  ))}
                </div>
              ) : null}
            </header>
            {children}
          </article>
        </main>
        <Footer />
        <TopNav />
      </div>
    </ToolbarDockProvider>
  );
}
