import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { LifeShell } from "../_components/LifeShell";
import type { LifeUserIdentity } from "../_components/AnimaPane";
import { isProjectSlug, PROJECTS } from "../_lib/project-map";
import { getSafeSession } from "@/lib/auth";

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

  // Resolve identity — authed user if signed in, guest otherwise.
  const hdrs = await headers();
  const session = await getSafeSession({ fetchOptions: { headers: hdrs } });
  let user: LifeUserIdentity | undefined;
  if (session?.user?.id) {
    const email = session.user.email ?? undefined;
    const name = session.user.name ?? email?.split("@")[0] ?? "User";
    user = {
      id: session.user.id,
      kind: "user",
      name,
      email,
      handle: email?.split("@")[0] ?? session.user.id.slice(0, 8),
    };
  } else {
    user = {
      id: "anonymous",
      kind: "agent",
      name: "Guest",
      handle: "guest",
    };
  }

  return (
    <LifeShell
      projectSlug={project}
      scenarioId={info.scenarioId}
      displayName={info.displayName}
      eyebrow={info.eyebrow}
      liveStream={info.liveStream}
      emptyTitle={info.emptyTitle}
      emptyHint={info.emptyHint}
      suggestions={info.suggestions}
      user={user}
    />
  );
}
