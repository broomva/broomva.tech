"use client";

import { usePostHog } from "posthog-js/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { TrackedLink } from "@/components/site/tracked-link";
import {
  ArrowUpRight,
  BookOpen,
  Code,
  Github,
  Linkedin,
  MessageCircle,
  Play,
  Twitter,
} from "lucide-react";

interface ContentItem {
  slug: string;
  title: string;
  summary: string;
  date?: string;
  status?: string;
  links: { url: string; label: string }[];
}

// ─── Featured hero content (update this when you publish something new) ───
const featuredPost = {
  slug: "agentic-control-loop",
  title: "The Agentic Control Loop",
  subtitle: "Re-Engineering LLMs as Supervisory Controllers",
  description:
    "Why treating LLMs as supervisory controllers — not autonomous agents — produces systems that scale, recover from failure, and improve over time.",
  videoThumbnail: "/images/writing/agentic-control-loop/hero.jpg",
  href: "/writing/agentic-control-loop",
  tag: "New post",
};

const quickActions = [
  {
    label: "Start here",
    href: "/start-here",
    icon: BookOpen,
    description: "The shortest path through my work",
    internal: true,
  },
  {
    label: "GitHub",
    href: "https://github.com/broomva",
    icon: Github,
    description: "Open source repos",
    internal: false,
  },
  {
    label: "Chat",
    href: "/chat",
    icon: MessageCircle,
    description: "Talk to the AI assistant",
    internal: true,
  },
];

const profileLinks = [
  { label: "GitHub", href: "https://github.com/broomva", icon: Github },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/broomva/",
    icon: Linkedin,
  },
  { label: "X", href: "https://x.com/broomva_tech", icon: Twitter },
  {
    label: "Hugging Face",
    href: "https://huggingface.co/Broomva",
    icon: Code,
  },
];

const secondaryDestinations = [
  {
    label: "Projects",
    href: "/projects",
    description: "Current project archive with context and links.",
    internal: true,
  },
  {
    label: "Writing",
    href: "/writing",
    description: "Long-form on control, orchestration, and agents.",
    internal: true,
  },
  {
    label: "Notes",
    href: "/notes",
    description: "Shorter field notes from building AI-native systems.",
    internal: true,
  },
  {
    label: "Book",
    href: "https://book.broomva.tech",
    description: "Knowledge base and course notes.",
    internal: false,
  },
  {
    label: "Photos",
    href: "https://photos.broomva.tech",
    description: "Public photo gallery.",
    internal: false,
  },
];

function LinksInner({
  latestWriting,
  projects,
}: {
  latestWriting: ContentItem[];
  projects: ContentItem[];
}) {
  const posthog = usePostHog();
  const searchParams = useSearchParams();

  useEffect(() => {
    const source = searchParams?.get("utm_source");
    if (source) {
      posthog?.capture("link_in_bio_opened", {
        utm_source: source,
        utm_medium: searchParams?.get("utm_medium"),
        utm_campaign: searchParams?.get("utm_campaign"),
        utm_content: searchParams?.get("utm_content"),
        referrer: document.referrer,
      });
    }
  }, [searchParams, posthog]);

  return (
    <>
      {/* ─── Hero: Featured content ─── */}
      <section className="mt-10">
        <TrackedLink
          href={featuredPost.href}
          label={featuredPost.title}
          linkType="hero"
          internal
          className="group relative block overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-bg-surface to-bg-elevated transition hover:-translate-y-0.5 hover:border-ai-blue/40"
        >
          <div className="flex flex-col md:flex-row">
            <div className="relative aspect-video w-full md:w-1/2">
              <img
                src={featuredPost.videoThumbnail}
                alt={featuredPost.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ai-blue/90 text-white shadow-lg backdrop-blur-sm">
                  <Play className="ml-1 h-6 w-6" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center p-6 md:w-1/2 md:p-8">
              <span className="mb-3 inline-flex w-fit rounded-full bg-ai-blue/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-ai-blue">
                {featuredPost.tag}
              </span>
              <h2 className="font-display text-2xl text-text-primary transition group-hover:text-ai-blue md:text-3xl">
                {featuredPost.title}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {featuredPost.subtitle}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {featuredPost.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-ai-blue">
                Read the full post
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </TrackedLink>
      </section>

      {/* ─── Quick actions ─── */}
      <section className="mt-8 grid grid-cols-3 gap-3">
        {quickActions.map((action) => (
          <TrackedLink
            key={action.href}
            href={action.href}
            label={action.label}
            linkType="quick_action"
            internal={action.internal}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-bg-surface p-5 text-center transition hover:-translate-y-0.5 hover:border-ai-blue/40"
          >
            <action.icon className="h-6 w-6 text-text-muted transition group-hover:text-ai-blue" />
            <span className="text-sm font-medium text-text-primary">
              {action.label}
            </span>
            <span className="text-xs text-text-muted">
              {action.description}
            </span>
          </TrackedLink>
        ))}
      </section>

      {/* ─── Latest writing ─── */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ai-blue">
              Latest
            </p>
            <h2 className="mt-1 font-display text-2xl text-text-primary">
              Writing
            </h2>
          </div>
          <TrackedLink
            href="/writing"
            label="All writing"
            linkType="content"
            internal
            className="text-xs uppercase tracking-widest text-text-muted transition hover:text-ai-blue"
          >
            View all &rarr;
          </TrackedLink>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {latestWriting.map((post) => (
            <TrackedLink
              key={post.slug}
              href={`/writing/${post.slug}`}
              label={post.title}
              linkType="content"
              internal
              className="group block rounded-xl border border-border bg-bg-surface p-4 transition hover:-translate-y-0.5 hover:border-ai-blue/40"
            >
              <p className="font-display text-lg text-text-primary transition group-hover:text-ai-blue">
                {post.title}
              </p>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                {post.summary}
              </p>
              {post.date && (
                <p className="mt-2 text-xs text-text-muted">{post.date}</p>
              )}
            </TrackedLink>
          ))}
        </div>
      </section>

      {/* ─── Profiles ─── */}
      <section className="mt-10">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-ai-blue">
          Profiles
        </p>
        <div className="flex flex-wrap gap-3">
          {profileLinks.map((link) => (
            <TrackedLink
              key={link.href}
              href={link.href}
              label={link.label}
              linkType="profile"
              className="group flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-text-secondary transition hover:border-ai-blue/40 hover:text-ai-blue"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </TrackedLink>
          ))}
        </div>
      </section>

      {/* ─── More destinations ─── */}
      <section className="mt-10">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-ai-blue">
          Explore
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {secondaryDestinations.map((dest) => (
            <TrackedLink
              key={dest.href}
              href={dest.href}
              label={dest.label}
              linkType="content"
              internal={dest.internal}
              className="group block rounded-xl border border-border bg-bg-surface p-4 transition hover:-translate-y-0.5 hover:border-ai-blue/40"
            >
              <p className="font-display text-lg text-text-primary transition group-hover:text-ai-blue">
                {dest.label}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {dest.description}
              </p>
            </TrackedLink>
          ))}
        </div>
      </section>

      {/* ─── Active projects (condensed) ─── */}
      {projects.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ai-blue">
                Projects
              </p>
              <h2 className="mt-1 font-display text-2xl text-text-primary">
                Current work
              </h2>
            </div>
            <TrackedLink
              href="/projects"
              label="All projects"
              linkType="content"
              internal
              className="text-xs uppercase tracking-widest text-text-muted transition hover:text-ai-blue"
            >
              View all &rarr;
            </TrackedLink>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.slice(0, 6).map((project) => (
              <TrackedLink
                key={project.slug}
                href={`/projects/${project.slug}`}
                label={project.title}
                linkType="content"
                internal
                className="group block rounded-xl border border-border bg-bg-surface p-4 transition hover:-translate-y-0.5 hover:border-ai-blue/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-lg text-text-primary transition group-hover:text-ai-blue">
                    {project.title}
                  </p>
                  {project.status && (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-text-muted">
                      {project.status}
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                  {project.summary}
                </p>
              </TrackedLink>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function LinksContent({
  latestWriting,
  projects,
}: {
  latestWriting: ContentItem[];
  projects: ContentItem[];
}) {
  return (
    <Suspense fallback={null}>
      <LinksInner latestWriting={latestWriting} projects={projects} />
    </Suspense>
  );
}
