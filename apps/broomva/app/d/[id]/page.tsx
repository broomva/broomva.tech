import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { getSpecDocForOwner } from "@/lib/db/spec-doc-queries";

/**
 * /d/[id] — gated viewer for a single agent-authored HTML document.
 *
 * Gate: must be logged in (else → /login?next=), and the doc must belong to
 * the session user (else 404, no existence leak). The document HTML is rendered
 * inside a sandboxed iframe via `srcDoc` — `allow-scripts` WITHOUT
 * `allow-same-origin`, so the doc runs in an opaque origin: its inline JS/charts
 * work, but it cannot read the broomva.tech session cookie, touch the parent DOM,
 * or make credentialed same-origin requests (CORS rejects the null origin).
 * `allow-popups-to-escape-sandbox` is intentionally NOT granted, so any popup the
 * doc opens stays sandboxed too.
 *
 * `srcDoc` (not an iframe `src` to a raw route) is deliberate: the proxy stamps
 * `X-Frame-Options: DENY` on protected responses, which would block framing a
 * same-origin raw route. Embedding the HTML directly sidesteps that entirely.
 */
export default async function DocViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/d/${id}`)}`);
  }

  const doc = await getSpecDocForOwner(id, userId);
  if (!doc) {
    notFound();
  }

  const published = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(doc.createdAt);

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
        sandbox="allow-scripts allow-popups"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
