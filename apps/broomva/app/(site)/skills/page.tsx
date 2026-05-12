import type { Metadata } from "next";
import { SkillsGrid } from "@/components/site/skills-grid";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS, TOTAL_SKILLS, TOTAL_LAYERS } from "@/lib/skills-data";

export const metadata: Metadata = {
  title: "Skills — The Broomva Stack",
  description: `${TOTAL_SKILLS}+ curated agent skills across ${TOTAL_LAYERS} layers for AI-native development. Install with one command.`,
};

export default async function SkillsPage() {
  // Dynamic: fetch from GitHub repos with bstack-* topics
  const dynamicLayers = await getSkillsRoster("broomva");

  // Merge: dynamic layers first, then static layers for any missing
  const dynamicIds = new Set(dynamicLayers.map((l) => l.id));
  const staticFallback = BSTACK_LAYERS.filter((l) => !dynamicIds.has(l.id));
  const layers = [...dynamicLayers, ...staticFallback];

  const totalSkills = layers.reduce((sum, l) => sum + l.skills.length, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          The Broomva Stack
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          {totalSkills} curated agent skills across {layers.length} layers. From
          safety shields to content pipelines — one install for the full
          AI-native development workflow.
        </p>
      </header>
      <SkillsGrid layers={layers} />
    </main>
  );
}
