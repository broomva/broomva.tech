import type { Route } from "next";
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
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-28">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="font-semibold text-2xl">Maestro</h1>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href={"/maestro/queue" as Route}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Handoff queue →
            </Link>
            <Link
              href={"/maestro/analytics" as Route}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Analytics
            </Link>
          </nav>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          Spec orchestration console. Manage the docs published at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            /d/&lt;handle&gt;
          </code>{" "}
          — open, archive, restore, delete. Hand the next session a{" "}
          <Link
            href={"/maestro/queue" as Route}
            className="underline transition-colors hover:text-foreground"
          >
            handoff
          </Link>
          . Defined by{" "}
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
          Orchestration state is read-only for now.
        </span>{" "}
        Specs show their orch-state, but the live trigger / run controls land
        with the relay runtime. To run a spec today, use{" "}
        <span className="font-medium text-foreground">Continue</span> (opens
        Claude Code) or{" "}
        <span className="font-medium text-foreground">Copy</span> (paste into
        Omnara). Design:{" "}
        <Link
          href="/d/maestro-relay-phase-1b"
          className="underline transition-colors hover:text-foreground"
        >
          relay-dispatch spec
        </Link>
        .
      </div>

      <MaestroBoard docs={docs} />
    </div>
  );
}
