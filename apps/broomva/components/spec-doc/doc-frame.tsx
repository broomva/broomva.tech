import Link from "next/link";
import type { SpecDoc, SpecDocState } from "@/lib/db/schema";

const STATE_BADGE: Partial<Record<SpecDocState, string>> = {
  draft: "Draft",
  superseded: "Superseded",
  archived: "Archived",
  expired: "Expired",
};

/**
 * Shared viewer chrome for a single SpecDoc (BRO-1300). Renders a minimal
 * mobile header (title + state/version badge + date) and the document HTML in a
 * sandboxed iframe.
 *
 * Isolation: `srcDoc` + `sandbox="allow-scripts"` — NO `allow-same-origin` (the
 * doc runs in an opaque origin: inline JS/charts work but it cannot read the
 * broomva.tech session cookie, touch the parent DOM, or make credentialed
 * same-origin requests) and NO `allow-popups` (the doc cannot open new tabs —
 * closes the popup-redirect vector flagged in the BRO-1293 adversarial pass).
 */
export function DocFrame({
  doc,
  pinnedVersion,
}: {
  doc: SpecDoc;
  pinnedVersion?: number;
}) {
  const published = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(doc.createdAt);

  const badge =
    STATE_BADGE[doc.state] ??
    (pinnedVersion != null ? `v${pinnedVersion}` : null);

  return (
    <div className="flex h-dvh max-h-dvh w-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <Link
          href="/d"
          aria-label="Back to your documents"
          className="shrink-0 rounded-md px-2 py-1 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
        >
          ← Docs
        </Link>
        <h1
          className="min-w-0 flex-1 truncate font-medium text-sm"
          title={doc.title}
        >
          {doc.title}
        </h1>
        {badge ? (
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
            {badge}
          </span>
        ) : null}
        <time
          dateTime={doc.createdAt.toISOString()}
          className="hidden shrink-0 text-muted-foreground text-xs sm:block"
        >
          {published}
        </time>
      </header>
      <iframe
        title={doc.title}
        srcDoc={doc.html}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
