import { PromptsList } from "@/components/site/prompts-list";
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
        <header>
          <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
            Prompts
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
            A versioned repository of reusable prompts for agent workflows, code
            review, research, architecture, and more.
          </p>
        </header>
        {session ? <UserPrompts session={session} /> : null}
        <PromptsList entries={entries} />
      </main>
      <PromptsEnergyBeam />
    </>
  );
}
