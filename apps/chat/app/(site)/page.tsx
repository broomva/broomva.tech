import { getLatest, getPinnedProjects } from "@/lib/content";
import { getRecentRepos } from "@/lib/github";
import { LandingClient } from "@/components/site/landing-sections";

export default async function Home() {
  const [projects, writing, notes, repos] = await Promise.all([
    getPinnedProjects(3),
    getLatest("writing", 3),
    getLatest("notes", 3),
    getRecentRepos("broomva", 6),
  ]);

  return (
    <LandingClient
      projects={projects}
      writing={writing}
      notes={notes}
      repos={repos}
    />
  );
}
