import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LifeShell } from "../_components/LifeShell";
import { isProjectSlug, PROJECTS } from "../_lib/project-map";

export async function generateStaticParams() {
  return Object.keys(PROJECTS).map((project) => ({ project }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string }>;
}): Promise<Metadata> {
  const { project } = await params;
  if (!isProjectSlug(project)) return { title: "Project not found" };
  const info = PROJECTS[project];
  return {
    title: info.displayName,
    description: `Life agent workspace for ${info.eyebrow}.`,
  };
}

export default async function LifeProjectPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  if (!isProjectSlug(project)) notFound();
  const info = PROJECTS[project];

  return (
    <LifeShell
      projectSlug={project}
      scenarioId={info.scenarioId}
      displayName={info.displayName}
      eyebrow={info.eyebrow}
    />
  );
}
