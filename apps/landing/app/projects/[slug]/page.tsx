import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/app/components/page-hero";
import { ProseContent } from "@/app/components/prose-content";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getAllSlugs, getContentBySlug } from "@/util/content";

interface ProjectPageProps {
	params: {
		slug: string;
	};
}

export async function generateStaticParams() {
	const slugs = await getAllSlugs("projects");
	return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
	const project = await getContentBySlug("projects", params.slug);

	if (!project) {
		return {
			title: "Project not found",
		};
	}

	return {
		title: project.title,
		description: project.summary,
	};
}

export default async function ProjectPage({ params }: ProjectPageProps) {
	const project = await getContentBySlug("projects", params.slug);
	if (!project) {
		notFound();
	}

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero title={project.title} description={project.summary} />

				<div className="mt-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-zinc-400">
					<span>{formatDate(project.date)}</span>
					{project.status ? <span className="rounded-full border border-zinc-700 px-2 py-1">{project.status}</span> : null}
				</div>

				{project.links.length ? (
					<div className="mt-6 flex flex-wrap gap-3">
						{project.links.map((link) => (
							<Link
								key={link.url}
								href={link.url}
								target="_blank"
								className="rounded-full border border-zinc-700 px-4 py-2 text-sm transition hover:border-zinc-500 hover:text-emerald-200"
							>
								{link.label}
							</Link>
						))}
					</div>
				) : null}

				<div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
					<ProseContent html={project.html} />
				</div>
			</main>
		</div>
	);
}
