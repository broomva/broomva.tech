import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PromptsEnergyBeam } from "@/components/site/prompts-energy-beam";
import { PromptsList } from "@/components/site/prompts-list";
import { UserPrompts } from "@/components/site/user-prompts";
import { getSafeSession } from "@/lib/auth";
import { getContentList } from "@/lib/content";
import { getNonPublicPromptSlugs } from "@/lib/db/queries";

export const metadata = {
  title: "Prompts",
  description:
    "Reusable, versioned prompts for agent workflows. Browse by category, copy with one click, or pull via API.",
};

export default function PromptsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl px-4 pb-0 pt-10 sm:px-6 sm:pt-14">
        <header>
          <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
            Prompts
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
            A versioned repository of reusable prompts for agent workflows, code
            review, research, architecture, and more.
          </p>
        </header>
        {/* User-owned prompts are session-dependent; stream them so the
            public list renders immediately without waiting on auth. */}
        <Suspense fallback={null}>
          <UserPromptsSlot />
        </Suspense>
        <Suspense fallback={null}>
          <PublicPromptsSlot />
        </Suspense>
      </main>
      <PromptsEnergyBeam />
    </>
  );
}

async function PublicPromptsSlot() {
  await connection();
  const [entries, nonPublicSlugs] = await Promise.all([
    getContentList("prompts"),
    getNonPublicPromptSlugs(),
  ]);
  const excluded = new Set(nonPublicSlugs);
  const publicEntries = entries.filter(({ slug }) => !excluded.has(slug));
  return <PromptsList entries={publicEntries} />;
}

async function UserPromptsSlot() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session) return null;
  return <UserPrompts session={session} />;
}
