import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { listSpecDocs } from "@/lib/db/spec-doc-queries";

/**
 * /d — the authenticated owner's list of published documents (BRO-1293).
 */
export default async function DocsListPage() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?next=/d");
  }

  const docs = await listSpecDocs(userId);
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl">Your documents</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Specs, PRDs, and reports published with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            broomva docs publish
          </code>
          . Visible only to you.
        </p>
      </header>

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No documents yet. Publish one with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            broomva docs publish file.html
          </code>
          .
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/d/${d.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {d.title}
                  </span>
                  {d.sourcePath ? (
                    <span className="block truncate text-muted-foreground text-xs">
                      {d.sourcePath}
                    </span>
                  ) : null}
                </span>
                <time
                  dateTime={d.createdAt.toISOString()}
                  className="shrink-0 text-muted-foreground text-xs"
                >
                  {dateFmt.format(d.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
