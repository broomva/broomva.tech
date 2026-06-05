import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { listHandoffEvents, listQueueHandoffs } from "@/lib/db/handoff-queries";
import type { TimelineEvent } from "./lib";
import { QueueBoard } from "./queue-board";
import { QueueStream } from "./queue-stream";

export const metadata = {
  title: "Maestro — handoff queue",
  robots: { index: false, follow: false },
};

/**
 * /maestro/queue — the handoff queue (BRO-1415). The human-readable layer that
 * articulates what to hand off NEXT: the `/handoff` skill pushes a narrative
 * here via `broomva handoff push`, it queues, relates to the HTML specs at
 * /d/<handle>, and is run by Copy/Continue (the same fresh-session trigger the
 * spec board uses, BRO-1399). A realtime stream card with a timeline sits on
 * top; the queue list sits below. Owner-gated (same identity gate as /maestro).
 */
export default async function MaestroQueuePage() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?next=/maestro/queue");
  }

  const [handoffs, events] = await Promise.all([
    listQueueHandoffs(userId),
    listHandoffEvents(userId, { limit: 40 }),
  ]);

  const timeline: TimelineEvent[] = events.map((e) => ({
    id: e.id,
    handoffId: e.handoffId,
    type: e.type,
    actor: e.actor,
    message: e.message,
    createdAt: e.createdAt,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-28">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/maestro"
            className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            Maestro
          </Link>
          <span className="text-muted-foreground/50 text-sm">/</span>
          <h1 className="font-semibold text-2xl">Queue</h1>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          The handoff queue — what to hand to the next session. Push one with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            broomva handoff push file.md
          </code>
          . Each entry relates to its{" "}
          <Link
            href="/maestro"
            className="underline transition-colors hover:text-foreground"
          >
            specs
          </Link>{" "}
          and runs via <span className="font-medium text-foreground">Copy</span>{" "}
          / <span className="font-medium text-foreground">Continue</span>.{" "}
          <Link
            href={"/maestro/analytics" as Route}
            className="underline transition-colors hover:text-foreground"
          >
            Analytics →
          </Link>
        </p>
      </header>

      <QueueStream initial={timeline} />
      <div className="mt-6">
        <QueueBoard handoffs={handoffs} />
      </div>
    </div>
  );
}
