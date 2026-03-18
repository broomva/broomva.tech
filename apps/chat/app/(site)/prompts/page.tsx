import { PageHero } from "@/components/site/page-hero";
import { CategoryFilter } from "@/components/site/category-filter";
import { PromptsEnergyBeam } from "@/components/site/prompts-energy-beam";
import { UserPrompts } from "@/components/site/user-prompts";
import { getContentList } from "@/lib/content";
import { getSafeSession } from "@/lib/auth";

export const metadata = {
  title: "Prompts",
  description:
    "Reusable, versioned prompts for agent workflows. Browse by category, copy with one click, or pull via API.",
};

export default async function PromptsPage() {
  const [entries, { data: session }] = await Promise.all([
    getContentList("prompts"),
    getSafeSession(),
  ]);

  return (
    <>
      <main className="mx-auto w-full max-w-6xl px-4 pb-0 pt-10 sm:px-6 sm:pt-14">
        <PageHero
          title="Prompts"
          description="A versioned repository of reusable prompts for agent workflows, code review, research, architecture, and more. Browse, copy, or pull via API."
        />
        {session ? <UserPrompts session={session} /> : null}
        <CategoryFilter entries={entries} />
      </main>
      <PromptsEnergyBeam />
    </>
  );
}
