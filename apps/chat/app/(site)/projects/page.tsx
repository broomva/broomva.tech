import { ProjectsList } from "@/components/site/projects-list";
import { PrinciplesGrid } from "@/components/site/principles-grid";
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
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          Projects
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          A running archive of what I ship: problem framing, architecture
          approach, current status, and links.
        </p>
      </header>
      <div className="mt-14">
        <PrinciplesGrid />
      </div>
      <ProjectsList entries={projects} />
    </main>
  );
}
