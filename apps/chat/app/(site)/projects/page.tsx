import { ContentCard } from "@/components/site/content-card";
import { PageHero } from "@/components/site/page-hero";
import { PrinciplesGrid } from "@/components/site/principles-grid";
import { formatDate } from "@/lib/date";
import { getContentList } from "@/lib/content";

export const metadata = {
  title: "Projects",
  description:
    "Projects where I build orchestration runtimes, governance layers, and agent OS infrastructure.",
  openGraph: {
    title: "Projects | broomva.tech",
    description:
      "Orchestration runtimes, governance layers, and agent OS infrastructure I build and ship.",
    url: "https://broomva.tech/projects",
    images: [
      {
        url: "https://broomva.tech/projects/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Projects | broomva.tech",
      },
    ],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "Projects | broomva.tech",
    description:
      "Orchestration runtimes, governance layers, and agent OS infrastructure I build and ship.",
    images: ["https://broomva.tech/projects/opengraph-image"],
  },
};

export default async function ProjectsPage() {
  const projects = await getContentList("projects");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Projects"
        description="A running archive of what I ship: problem framing, architecture approach, current status, and links."
      />
      <div className="mt-14">
        <PrinciplesGrid />
      </div>
      <section className="mt-14 grid gap-4 md:grid-cols-2">
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
  );
}
