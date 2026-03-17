import { ContentCard } from "@/app/components/content-card";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";
import { formatDate } from "@/util/date";
import { getContentList } from "@/util/content";

export const metadata = {
	title: "Projects",
	description: "Projects where I build interfaces, harnesses, and workflows for reliable AI systems.",
};

export default async function ProjectsPage() {
	const projects = await getContentList("projects");

	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Projects"
					description="A running archive of what I ship: problem framing, architecture approach, current status, and links."
				/>
				<section className="mt-10 grid gap-4 md:grid-cols-2">
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
				</section>
			</main>
		</div>
	);
}
