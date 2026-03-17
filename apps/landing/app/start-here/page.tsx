import Link from "next/link";
import { ContentCard } from "@/app/components/content-card";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getLatest, getPinnedProjects } from "@/util/content";

export const metadata = {
	title: "Start Here",
	description: "A guided entry point to what I build, why it matters, and where to follow my work.",
};

const followLinks = [
	{ href: "https://hi.broomva.tech", label: "Link hub" },
	{ href: "https://github.com/broomva", label: "GitHub" },
	{ href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
	{ href: "https://x.com/broomva_", label: "X" },
];

export default async function StartHerePage() {
	const [projects, writing, notes] = await Promise.all([
		getPinnedProjects(3),
		getLatest("writing", 3),
		getLatest("notes", 2),
	]);

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Start here"
					description="I build reliable agentic systems: interfaces and harnesses that turn LLM capability into shippable workflows. This page is the shortest route to my best work."
				/>

				<section className="mt-10 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:grid-cols-2 sm:gap-6">
					<div>
						<h2 className="font-display text-2xl">What I build</h2>
						<p className="mt-3 text-sm leading-relaxed text-zinc-300">
							AI-native workflows where agents can reason, execute tools safely, recover from failure, and stay observable in
							runtime.
						</p>
					</div>
					<div>
						<h2 className="font-display text-2xl">Why it matters</h2>
						<p className="mt-3 text-sm leading-relaxed text-zinc-300">
							Most failures are not model failures. They are harness failures. I focus on primitives that make agents reliable,
							controllable, and useful in production constraints.
						</p>
					</div>
				</section>

				<section className="mt-12">
					<div className="mb-6 flex items-end justify-between">
						<h2 className="font-display text-3xl">Best projects</h2>
						<Link href="/projects" className="text-sm text-emerald-300 transition hover:text-emerald-200">
							All projects
						</Link>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{projects.map((project) => (
							<ContentCard
								key={project.slug}
								title={project.title}
								summary={project.summary}
								href={`/projects/${project.slug}`}
								meta={formatDate(project.date)}
								badge={project.status}
							/>
						))}
					</div>
				</section>

				<section className="mt-12 grid gap-6 lg:grid-cols-2">
					<div>
						<h2 className="mb-6 font-display text-3xl">Best writing</h2>
						<div className="grid gap-4">
							{writing.map((entry) => (
								<ContentCard
									key={entry.slug}
									title={entry.title}
									summary={entry.summary}
									href={`/writing/${entry.slug}`}
									meta={formatDate(entry.date)}
								/>
							))}
						</div>
					</div>
					<div>
						<h2 className="mb-6 font-display text-3xl">Recent notes</h2>
						<div className="grid gap-4">
							{notes.map((entry) => (
								<ContentCard
									key={entry.slug}
									title={entry.title}
									summary={entry.summary}
									href={`/notes/${entry.slug}`}
									meta={formatDate(entry.date)}
								/>
							))}
						</div>
					</div>
				</section>

				<section className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
					<h2 className="font-display text-2xl">Where to follow</h2>
					<div className="mt-4 flex flex-wrap gap-3">
						{followLinks.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								target="_blank"
								className="rounded-full border border-zinc-700 px-4 py-2 text-sm transition hover:border-zinc-500 hover:text-emerald-200"
							>
								{item.label}
							</Link>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}
