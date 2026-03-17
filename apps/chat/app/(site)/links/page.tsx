import type { Route } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { getContentList } from "@/lib/content";

const primaryDestinations = [
  {
    label: "Start here",
    handle: "broomva.tech/start-here",
    href: "/start-here",
    description: "The shortest route through the work, writing, and current focus.",
    internal: true,
  },
  {
    label: "Projects",
    handle: "broomva.tech/projects",
    href: "/projects",
    description: "The current project archive with context, status, and links.",
    internal: true,
  },
  {
    label: "Writing",
    handle: "broomva.tech/writing",
    href: "/writing",
    description: "Long-form thinking on control, orchestration, and agent systems.",
    internal: true,
  },
  {
    label: "Notes",
    handle: "broomva.tech/notes",
    href: "/notes",
    description: "Shorter field notes from building AI-native systems.",
    internal: true,
  },
  {
    label: "Chat",
    handle: "broomva.tech/chat",
    href: "/chat",
    description: "The live chat workspace inside this project.",
    internal: true,
  },
  {
    label: "Book",
    handle: "book.broomva.tech",
    href: "https://book.broomva.tech",
    description: "Knowledge base, course notes, and the original book archive.",
  },
  {
    label: "Book chat",
    handle: "chat.broomva.tech",
    href: "https://chat.broomva.tech",
    description: "Standalone chat experience for the book corpus.",
  },
  {
    label: "Vortex",
    handle: "vortex.broomva.tech",
    href: "https://vortex.broomva.tech",
    description: "Legacy Vortex landing page with docs and flow entry points.",
  },
  {
    label: "Photos",
    handle: "photos.broomva.tech",
    href: "https://photos.broomva.tech",
    description: "Public photo gallery.",
  },
];

const profileLinks = [
  {
    label: "GitHub",
    handle: "github.com/broomva",
    href: "https://github.com/broomva",
  },
  {
    label: "Hugging Face",
    handle: "huggingface.co/Broomva",
    href: "https://huggingface.co/Broomva",
  },
  {
    label: "LinkedIn",
    handle: "linkedin.com/in/broomva",
    href: "https://www.linkedin.com/in/broomva/",
  },
  {
    label: "X",
    handle: "x.com/broomva_",
    href: "https://x.com/broomva_",
  },
  {
    label: "Legacy landing",
    handle: "www.broomva.tech",
    href: "https://www.broomva.tech",
  },
];

const deploymentInventory = [
  {
    host: "www.broomva.tech",
    href: "https://www.broomva.tech",
    status: "Live",
    category: "Legacy landing",
    description: "Older public profile landing page that is still reachable.",
  },
  {
    host: "book.broomva.tech",
    href: "https://book.broomva.tech",
    status: "Live",
    category: "Knowledge base",
    description: "Book archive and docs hub.",
  },
  {
    host: "chat.broomva.tech",
    href: "https://chat.broomva.tech",
    status: "Live",
    category: "Chat app",
    description: "Standalone Broomva Book chat app.",
  },
  {
    host: "photos.broomva.tech",
    href: "https://photos.broomva.tech",
    status: "Live",
    category: "Gallery",
    description: "Public photo gallery.",
  },
  {
    host: "vortex.broomva.tech",
    href: "https://vortex.broomva.tech",
    status: "Live",
    category: "Project landing",
    description: "Vortex landing page linking to docs and flow templates.",
  },
  {
    host: "apps.broomva.tech",
    href: "https://apps.broomva.tech",
    status: "404",
    category: "Inactive",
    description: "No active deployment found at scan time.",
  },
  {
    host: "blog.broomva.tech",
    href: "https://blog.broomva.tech",
    status: "404",
    category: "Inactive",
    description: "No active deployment found at scan time.",
  },
  {
    host: "docs.broomva.tech",
    href: "https://docs.broomva.tech",
    status: "404",
    category: "Inactive",
    description: "No active deployment found at scan time.",
  },
  {
    host: "gitbook.broomva.tech",
    href: "https://gitbook.broomva.tech",
    status: "404",
    category: "Inactive",
    description: "No active deployment found at scan time.",
  },
  {
    host: "landing.broomva.tech",
    href: "https://landing.broomva.tech",
    status: "404",
    category: "Inactive",
    description: "No active deployment found at scan time.",
  },
  {
    host: "silat-agent.broomva.tech",
    href: "https://silat-agent.broomva.tech",
    status: "404",
    category: "Infra",
    description: "Host resolves but does not expose a public app right now.",
  },
  {
    host: "vortex-api.broomva.tech",
    href: "https://vortex-api.broomva.tech",
    status: "404",
    category: "Infra",
    description: "Referenced by Vortex, but no public endpoint responded at scan time.",
  },
  {
    host: "vortex-flows.broomva.tech",
    href: "https://vortex-flows.broomva.tech",
    status: "404",
    category: "Infra",
    description: "No public deployment responded at scan time.",
  },
  {
    host: "vortex-multitenant.broomva.tech",
    href: "https://vortex-multitenant.broomva.tech",
    status: "404",
    category: "Infra",
    description: "No active deployment found at scan time.",
  },
  {
    host: "vortex-s3.broomva.tech",
    href: "https://vortex-s3.broomva.tech",
    status: "404",
    category: "Infra",
    description: "Host resolves but does not expose a public app right now.",
  },
];

export const metadata = {
  title: "Links",
  description:
    "A first-party link hub for broomva.tech, including core destinations, active projects, and scanned public deployments.",
};

function renderPill(link: { href: string; label: string; internal?: boolean }) {
  const className =
    "rounded-full border border-zinc-700 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-zinc-300 transition hover:border-zinc-500 hover:text-emerald-200";

  if (link.internal) {
    return (
      <Link key={link.href} href={link.href as Route} className={className}>
        {link.label}
      </Link>
    );
  }

  return (
    <a
      key={link.href}
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {link.label}
    </a>
  );
}

export default async function LinksPage() {
  const projects = await getContentList("projects");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Links"
        description="Everything worth opening from the Broomva ecosystem in one place: core pages, live projects, and the current `*.broomva.tech` deployment inventory."
      />

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {primaryDestinations.map((item) => {
          const className =
            "group block rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-zinc-900";

          const content = (
            <>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">
                {item.label}
              </p>
              <p className="mt-2 font-display text-2xl text-zinc-100 transition group-hover:text-emerald-200">
                {item.handle}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {item.description}
              </p>
            </>
          );

          if (item.internal) {
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                className={className}
              >
                {content}
              </Link>
            );
          }

          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {content}
            </a>
          );
        })}
      </section>

      <section className="mt-12 rounded-3xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Profiles
            </p>
            <h2 className="mt-2 font-display text-3xl text-zinc-100">
              Public accounts
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            These are the main external profiles and legacy properties linked
            from the older public hub.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {profileLinks.map((item) => renderPill(item))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Projects
            </p>
            <h2 className="mt-2 font-display text-3xl text-zinc-100">
              Current work
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Every project page in this repo, plus its repository and live links
            when available.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.slug}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/projects/${project.slug}` as Route}
                    className="font-display text-2xl text-zinc-100 transition hover:text-emerald-200"
                  >
                    {project.title}
                  </Link>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                    {project.summary}
                  </p>
                </div>
                {project.status ? (
                  <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-300">
                    {project.status}
                  </span>
                ) : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {renderPill({
                  href: `/projects/${project.slug}`,
                  label: "Project page",
                  internal: true,
                })}
                {project.links.map((link) =>
                  renderPill({
                    href: link.url,
                    label: link.label,
                  }),
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Deployment inventory
            </p>
            <h2 className="mt-2 font-display text-3xl text-zinc-100">
              `*.broomva.tech` scan
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Public subdomains discovered from live probing and certificate
            records. Inactive hosts stay listed here for completeness.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deploymentInventory.map((deployment) => (
            <a
              key={deployment.host}
              href={deployment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-xl text-zinc-100">
                  {deployment.host}
                </p>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-300">
                  {deployment.status}
                </span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
                {deployment.category}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {deployment.description}
              </p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
