import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";

export const metadata = {
  title: "Now",
  description:
    "What I am focused on right now: Rust Agent OS stack, control metalayers, and harness engineering.",
};

const focus = [
  "Building the Rust Agent OS stack: Symphony orchestration, control metalayer governance, aiOS kernel.",
  "Publishing short Notes and long-form essays directly from repo-driven workflows.",
  "Improving a Codex-first process where agents open high-quality PRs with clear acceptance criteria.",
];

const learning = [
  "Rust runtime design patterns for durable, checkpointed agent workflows.",
  "Policy evaluation engines that enforce governance constraints in real-time.",
  "How to keep agentic products fast while maintaining deterministic deployment checks.",
];

export default function NowPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Now"
        description="A monthly snapshot of my current build focus, open questions, and where I want collaboration."
      />
      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl glass p-6">
          <h2 className="font-display text-2xl">Building now</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
            {focus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl glass p-6">
          <h2 className="font-display text-2xl">Learning now</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text-secondary">
            {learning.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="mt-10 rounded-2xl glass p-6">
        <h2 className="font-display text-2xl">Collaborate</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          If you are building production agent systems and want to compare
          architectures, constraints, or tooling, use the contact page and
          include your current bottleneck.
        </p>
        <Link
          href="/contact"
          className="mt-5 inline-flex rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
        >
          Open contact options
        </Link>
      </section>
    </main>
  );
}
