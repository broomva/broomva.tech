import Link from "next/link";
import { ContentCard } from "@/app/components/content-card";
import Particles from "@/app/components/particles";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getLatest, getPinnedProjects } from "@/util/content";

const socials = [
	{ href: "https://github.com/broomva", label: "GitHub" },
	{ href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
	{ href: "https://x.com/broomva_", label: "X" },
	{ href: "https://hi.broomva.tech", label: "Link hub" },
];

export default async function Home() {
	const [projects, writing, notes] = await Promise.all([
		getPinnedProjects(3),
		getLatest("writing", 3),
		getLatest("notes", 3),
	]);
	const chatAppUrl = process.env.NEXT_PUBLIC_CHAT_APP_URL ?? "http://localhost:3001";

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
				<Particles className="pointer-events-none absolute inset-0 -z-10" quantity={180} staticity={18} ease={60} />
				<section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-black to-zinc-900/20 px-6 py-16 sm:px-12">
					<div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
					<div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
					<p className="relative text-xs uppercase tracking-[0.25em] text-emerald-300">Carlos D. Escobar-Valbuena</p>
					<h1 className="relative mt-3 font-display text-4xl text-zinc-100 sm:text-6xl">Building reliable agentic systems</h1>
					<p className="relative mt-5 max-w-3xl text-base leading-relaxed text-zinc-300 sm:text-lg">
						Interfaces and harness engineering for AI-native workflows. I ship OSS and write about what works in
						production.
					</p>
					<div className="relative mt-8 flex flex-wrap items-center gap-3">
						<Link
							href="/start-here"
							className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-200"
						>
							Start here
						</Link>
						<Link
							href="/contact"
							className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500"
						>
							Collaborate
						</Link>
					</div>
					<div className="relative mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
						{socials.map((social) => (
							<Link key={social.href} href={social.href} target="_blank" className="transition hover:text-zinc-200">
								{social.label}
							</Link>
						))}
					</div>
				</section>

				<section className="mt-10">
					<div className="rounded-3xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
						<div className="mx-auto max-w-3xl">
							<p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Interactive clone</p>
							<h2 className="mt-2 font-display text-3xl text-zinc-100 sm:text-4xl">Talk with Broomva</h2>
							<p className="mt-3 text-sm leading-relaxed text-zinc-300 sm:text-base">
								Use the live chat workspace for prompts, tool calls, and threaded conversation history.
							</p>
							<Link
								href={chatAppUrl}
								className="group mt-6 block rounded-2xl border border-zinc-700 bg-black/60 p-4 transition hover:border-emerald-300/50"
							>
								<div className="flex items-center justify-between gap-3">
									<span className="text-sm text-zinc-400">Prompt Broomva...</span>
									<span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-black">
										Open chat
									</span>
								</div>
							</Link>
						</div>
					</div>
				</section>

				<section className="mt-14">
					<div className="mb-6 flex items-end justify-between">
						<h2 className="font-display text-3xl text-zinc-100">Pinned Projects</h2>
						<Link href="/projects" className="text-sm text-emerald-300 transition hover:text-emerald-200">
							View all
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

				<section className="mt-14 grid gap-6 lg:grid-cols-2">
					<div>
						<div className="mb-6 flex items-end justify-between">
							<h2 className="font-display text-3xl text-zinc-100">Latest Writing</h2>
							<Link href="/writing" className="text-sm text-emerald-300 transition hover:text-emerald-200">
								Read all
							</Link>
						</div>
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
						<div className="mb-6 flex items-end justify-between">
							<h2 className="font-display text-3xl text-zinc-100">Recent Notes</h2>
							<Link href="/notes" className="text-sm text-emerald-300 transition hover:text-emerald-200">
								Browse notes
							</Link>
						</div>
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
			</main>
		</div>
	);
}
