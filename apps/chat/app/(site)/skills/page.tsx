import type { Metadata } from "next";
import { PageHero } from "@/components/site/page-hero";
import { SkillsGrid } from "@/components/site/skills-grid";
import { TOTAL_SKILLS, TOTAL_LAYERS } from "@/lib/skills-data";

export const metadata: Metadata = {
  title: "Skills — The Broomva Stack",
  description: `${TOTAL_SKILLS} curated agent skills across ${TOTAL_LAYERS} layers for AI-native development. Install with one command.`,
};

export default function SkillsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="The Broomva Stack"
        description={`${TOTAL_SKILLS} curated agent skills across ${TOTAL_LAYERS} layers. From safety shields to content pipelines — one install for the full AI-native development workflow.`}
      />
      <SkillsGrid />
    </main>
  );
}
