import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  // LifeShell mounts in a follow-up commit.
  return (
    <div className="life-landing">
      <div className="life-landing__inner">
        <div className="life-landing__eyebrow">{info.eyebrow}</div>
        <h1 className="life-landing__title">{info.displayName}</h1>
        <p className="life-landing__sub">
          The full three-column workspace mounts in the next commit. This stub
          confirms the dynamic route + project map are wired correctly.
        </p>
      </div>
    </div>
  );
}
