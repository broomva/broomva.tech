import type { Metadata } from "next";
import Link from "next/link";
import { PROJECTS, type ProjectChipColor } from "./_lib/project-map";

const CHIP_LABELS: Record<ProjectChipColor, string> = {
  emerald: "live",
  amber: "research",
  violet: "paid",
};

export const metadata: Metadata = {
  title: "Life · Agent Workspace",
  description:
    "Three-column AI-native agent workspace for Life — chat, workspace, and inspector.",
};

export default function LifeLandingPage() {
  const entries = Object.entries(PROJECTS);
  return (
    <div className="life-landing">
      <div className="life-landing__inner">
        <div className="life-landing__eyebrow">broomva.tech / life</div>
        <h1 className="life-landing__title">Pick a Life project</h1>
        <p className="life-landing__sub">
          Each project is a three-column agent workspace: streaming chat on the
          left, live filesystem and journal in the middle, and metrics inspectors
          on the right. Today these are demo replays. Phase B wires real Arcan
          streaming through <code>/api/life/run/[project]</code>.
        </p>
        <div className="life-landing__grid">
          {entries.map(([slug, project]) => (
            <Link
              key={slug}
              href={`/life/${slug}`}
              className="life-landing__card"
            >
              <span
                className={`life-landing__chip life-landing__chip--${project.chipColor}`}
              >
                {CHIP_LABELS[project.chipColor]}
              </span>
              <div className="life-landing__card-eyebrow">{project.eyebrow}</div>
              <div className="life-landing__card-title">{project.displayName}</div>
              <div className="life-landing__card-body">
                Open the {slug} workspace to replay an Arcan agent run with
                full filesystem, journal, and metrics inspectors.
              </div>
              <div className="life-landing__card-cta">Open /life/{slug} ▸</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
