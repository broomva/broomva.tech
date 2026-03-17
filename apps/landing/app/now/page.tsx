import Link from "next/link";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";

export const metadata = {
	title: "Now",
	description: "What I am focused on right now and what I am learning this month.",
};

const focus = [
	"Building harness primitives that keep agent loops observable, recoverable, and safe.",
	"Publishing short Notes and long-form essays directly from repo-driven workflows.",
	"Improving a Codex-first process where agents open high-quality PRs with clear acceptance criteria.",
];

const learning = [
	"Evaluation strategies for multi-step tools with partial failures.",
	"UI patterns that expose intent, state, and confidence without overwhelming operators.",
	"How to keep agentic products fast while maintaining deterministic deployment checks.",
];

export default function NowPage() {
	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Now"
					description="A monthly snapshot of my current build focus, open questions, and where I want collaboration."
				/>
				<section className="mt-10 grid gap-6 lg:grid-cols-2">
					<div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
						<h2 className="font-display text-2xl">Building now</h2>
						<ul className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
							{focus.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
					<div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
						<h2 className="font-display text-2xl">Learning now</h2>
						<ul className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
							{learning.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</section>
				<section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
					<h2 className="font-display text-2xl">Collaborate</h2>
					<p className="mt-3 text-sm leading-relaxed text-zinc-300">
						If you are building production agent systems and want to compare architectures, constraints, or tooling, use the
						contact page and include your current bottleneck.
					</p>
					<Link
						href="/contact"
						className="mt-5 inline-flex rounded-full border border-zinc-700 px-4 py-2 text-sm transition hover:border-zinc-500 hover:text-emerald-200"
					>
						Open contact options
					</Link>
				</section>
			</main>
		</div>
	);
}
