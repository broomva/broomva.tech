import type { Metadata } from "next";
import { SkillsGrid } from "@/components/site/skills-grid";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS, TOTAL_SKILLS, TOTAL_LAYERS } from "@/lib/skills-data";

export const metadata: Metadata = {
  title: "Skills — The Broomva Stack",
  description: `${TOTAL_SKILLS}+ curated agent skills synced live from github.com/broomva. Install with one command.`,
};

export default async function SkillsPage() {
  // Canonical inventory: every broomva/* repo with SKILL.md at root.
  // Topic tags are inconsistent across the org; SKILL.md presence is the
  // single signal that "this is a published skill." See lib/github.ts.
  const dynamicLayers = await getSkillsRoster("broomva");

  // Fallback only if the GitHub fetch returned nothing (network/auth
  // issue). The static BSTACK_LAYERS is the last-known-good copy from
  // before dynamic sync existed; it shouldn't be reached in production.
  const layers = dynamicLayers.length > 0 ? dynamicLayers : BSTACK_LAYERS;

  const totalSkills = layers.reduce((sum, l) => sum + l.skills.length, 0);
  const isDynamic = dynamicLayers.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          The Broomva Stack
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          {totalSkills} curated agent skills across {layers.length} layer
          {layers.length !== 1 ? "s" : ""}. {isDynamic ? (
            <>
              Synced live from{" "}
              <a
                href="https://github.com/broomva"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-ai-blue/40 underline-offset-4 transition hover:decoration-ai-blue"
              >
                github.com/broomva
              </a>
              {" "}— every repo with{" "}
              <code className="rounded bg-bg-elevated/40 px-1 py-0.5 font-mono text-[11px]">
                SKILL.md
              </code>{" "}
              is listed here.
            </>
          ) : (
            <>One install for the full AI-native development workflow.</>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-text-muted/70">
          <a
            href="https://skills.sh/broomva"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-border/30 bg-bg-elevated/20 px-3 py-1 backdrop-blur-sm transition hover:border-ai-blue/30 hover:text-ai-blue"
          >
            skills.sh/broomva ↗
          </a>
          <a
            href="https://github.com/broomva"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-border/30 bg-bg-elevated/20 px-3 py-1 backdrop-blur-sm transition hover:border-border/60 hover:text-text-secondary"
          >
            github.com/broomva ↗
          </a>
        </div>
      </header>
      <SkillsGrid layers={layers} />
    </main>
  );
}
