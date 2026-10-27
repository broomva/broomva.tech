import { ArrowDown, ArrowUpRight, BookOpen, Play } from "lucide-react";
import type { Metadata } from "next";
import { agentWorkspaces as release } from "@/lib/agent-workspaces";
import styles from "./page.module.css";

const description =
  "A living guide to agent workspaces, context, knowledge graphs, skills, repository structure, and operating a fleet. Watch the keynote, read the guide, or download both PDFs.";

export const metadata: Metadata = {
  title: "Agent workspaces",
  description,
  alternates: { canonical: "https://broomva.tech/agent-workspaces" },
  openGraph: {
    title: "Agent workspaces",
    description,
    url: "https://broomva.tech/agent-workspaces",
    type: "website",
    images: [
      {
        url: `https://broomva.tech${release.base}/deck/preview.webp`,
        width: 1920,
        height: 1080,
        alt: "Agent workspaces keynote",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent workspaces",
    description,
    images: [`https://broomva.tech${release.base}/deck/preview.webp`],
  },
};

const chapters = [
  {
    title: "Workspaces",
    detail:
      "The filesystem, sandbox, harness, and layers that make work durable.",
    scene: 4,
  },
  {
    title: "Context",
    detail:
      "What the agent sees, what it remembers, and how hooks bring it back.",
    scene: 10,
  },
  {
    title: "Second brain",
    detail:
      "Entities, front matter, a knowledge index, and retrieval with evidence.",
    scene: 14,
  },
  {
    title: "Skills",
    detail:
      "Reusable instructions composed with tools, protocols, and a harness.",
    scene: 20,
  },
  {
    title: "Structure",
    detail: "One workspace, sovereign repositories, and isolated worktrees.",
    scene: 24,
  },
  {
    title: "Fleets",
    detail: "When to spawn, reuse, hand off, review, and escalate.",
    scene: 27,
  },
  {
    title: "Leadership",
    detail:
      "Clear intent, shared standards, and evidence that closes the loop.",
    scene: 31,
  },
];

export default function AgentWorkspacesPage() {
  return (
    <div className={styles.page}>
      <section className={styles.intro} aria-labelledby="keynote-title">
        <p className={styles.byline}>
          A keynote and field guide by Carlos Escobar
        </p>
        <h1 id="keynote-title">Agent workspaces</h1>
        <p className={styles.lead}>
          Give the agent a place to work.
          <br />
          Build the system that lets it learn.
        </p>
        <p className={styles.description}>
          From a folder and a shell to a second brain and a fleet. A practical
          tour of the context, skills, structure, and judgment behind agentic
          work.
        </p>
        <div className={styles.actions}>
          <a className={styles.primary} href={release.deck}>
            <Play size={17} aria-hidden="true" /> Open presentation
          </a>
          <a
            className={styles.secondary}
            href={`${release.deck}#scene=1&guide`}
          >
            <BookOpen size={17} aria-hidden="true" /> Read the guide
          </a>
        </div>
        <p className={styles.meta}>
          37 scenes · 7 chapters · About 47 minutes · Free and open source
        </p>
      </section>

      <a
        href={release.deck}
        className={styles.preview}
        aria-label="Open the Agent workspaces presentation"
      >
        {/* A release artifact is served directly to preserve its exact pixels. */}
        {/* biome-ignore lint/performance/noImgElement: immutable release preview */}
        <img
          src={`${release.base}/deck/preview.webp`}
          alt="A still from the living Agent workspaces keynote"
          width={1920}
          height={1080}
          fetchPriority="high"
        />
        <span className={styles.previewCaption}>
          <span>
            <Play size={16} aria-hidden="true" /> Explore the living keynote
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </a>

      <section className={styles.section} aria-labelledby="chapters-title">
        <div className={styles.sectionHeading}>
          <h2 id="chapters-title">A place for every part of the work</h2>
          <p>Follow the narrative, or enter where you need it.</p>
        </div>
        <ol className={styles.chapters}>
          {chapters.map((chapter, index) => (
            <li key={chapter.title}>
              <a href={`${release.deck}#scene=${chapter.scene}&guide`}>
                <span className={styles.number}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.detail}</p>
                </div>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="take-title">
        <div className={styles.sectionHeading}>
          <h2 id="take-title">Take it with you</h2>
          <p>The same release, ready to read, present, or build on.</p>
        </div>
        <div className={styles.downloads}>
          <a
            href={`${release.base}/downloads/agent-workspaces-slides.pdf`}
            download
          >
            <ArrowDown size={22} aria-hidden="true" />
            <h3>Slides PDF</h3>
            <p>
              All 37 scenes, captured at their final beat. Made for presenting
              and quick reference.
            </p>
            <span>
              Download slides <ArrowUpRight size={15} aria-hidden="true" />
            </span>
          </a>
          <a
            href={`${release.base}/downloads/agent-workspaces-guide.pdf`}
            download
          >
            <BookOpen size={22} aria-hidden="true" />
            <h3>Reader guide PDF</h3>
            <p>
              The slides, beat by beat, with explanations, prompts, steps, and
              references.
            </p>
            <span>
              Download guide <ArrowUpRight size={15} aria-hidden="true" />
            </span>
          </a>
        </div>
        <div className={styles.resources}>
          <a href={`${release.base}/resources.md`}>
            Resources and tools <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a href={`${release.base}/script.md`}>
            Speaker script <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <a href={release.repository}>
            Source and contribution guide{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          Version {release.version}. The live deck and PDFs are published
          together.
        </p>
        <p>
          Use the arrow keys to move through the presentation. Open Guide for
          the full explanation. Copy a scene link to share a specific idea.
        </p>
        <a href={`${release.base}/release.json`}>
          Release manifest <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
