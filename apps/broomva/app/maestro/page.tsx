import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { listBoardSpecDocs } from "@/lib/db/spec-doc-queries";
import { MaestroBoard } from "./maestro-board";

export const metadata = {
  title: "Maestro — spec console",
  robots: { index: false, follow: false },
};

/**
 * /maestro — the spec orchestration console (BRO-1349, Maestro Phase 1). The
 * human-facing board over the documents served at /d/<handle>: list, open,
 * archive, restore, delete. Owner-gated (same identity gate as /d). Defined by
 * the spec at /d/maestro. The orchestration plane (Trigger / run-state) lands
 * in Phase 1b — this console manages the content plane today.
 */
export default async function MaestroPage() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?next=/maestro");
  }

  const docs = await listBoardSpecDocs(userId);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl">Maestro</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Spec orchestration console. Manage the docs published at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            /d/&lt;handle&gt;
          </code>{" "}
          — open, archive, restore, delete. Defined by{" "}
          <Link
            href="/d/maestro"
            className="underline transition-colors hover:text-foreground"
          >
            /d/maestro
          </Link>
          .
        </p>
      </header>

      <div className="mb-6 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-muted-foreground text-xs">
        <span className="font-medium text-foreground">
          Orchestration state is live.
        </span>{" "}
        Each spec now carries an orch-state (every spec starts{" "}
        <code className="rounded bg-muted px-1 py-0.5">proposed</code>). The{" "}
        <strong>Trigger</strong> action that drives it through running → review
        → done — plus the run log and dispatch budget — lands in Phase 1.
      </div>

      <MaestroBoard docs={docs} />
    </div>
  );
}
