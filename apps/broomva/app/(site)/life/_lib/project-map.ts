/**
 * UI-side project metadata — thin shim over the canonical registry.
 *
 * The single source of truth is `lib/life-runtime/projects.ts` (the
 * registry consumed by the API route, the runtime, and the DB seed).
 * This file projects the registry into the legacy UI shape so the
 * `/life` landing page + `/life/[project]` workspace shell don't need
 * to be refactored in the same PR.
 *
 * Adding / removing / editing a project happens in the canonical
 * registry; this file picks up changes automatically on next build.
 *
 * Spec: `apps/broomva/docs/superpowers/specs/2026-05-03-life-runtime-canonical.md`
 */

import {
  PROJECTS as CANONICAL_PROJECTS,
  isProjectSlug as canonicalIsProjectSlug,
  type ProjectConfig,
  type ProjectSlug as CanonicalProjectSlug,
} from "@/lib/life-runtime/projects";

export type ProjectChipColor = ProjectConfig["ui"]["chipColor"];

export interface LifeProjectInfo {
  displayName: string;
  eyebrow: string;
  chipColor: ProjectChipColor;
  /** Empty-state title above the composer prompt. */
  emptyTitle?: string;
  /** Empty-state hint describing what the project does. */
  emptyHint?: string;
  /** First-turn suggestions shown as clickable chips. */
  suggestions?: Array<{ label: string; prompt: string }>;
}

function fromCanonical(cfg: ProjectConfig): LifeProjectInfo {
  return {
    displayName: cfg.displayName,
    eyebrow: cfg.ui.eyebrow,
    chipColor: cfg.ui.chipColor,
    emptyTitle: cfg.ui.emptyTitle,
    emptyHint: cfg.ui.emptyHint,
    suggestions: cfg.ui.suggestions,
  };
}

/**
 * Project map indexed by slug. Equivalent to the legacy hand-rolled
 * registry — derived from the canonical `lib/life-runtime/projects.ts`
 * so the two never drift.
 */
export const PROJECTS = Object.fromEntries(
  (Object.entries(CANONICAL_PROJECTS) as Array<[CanonicalProjectSlug, ProjectConfig]>)
    .map(([slug, cfg]): [CanonicalProjectSlug, LifeProjectInfo] => [
      slug,
      fromCanonical(cfg),
    ]),
) as Record<CanonicalProjectSlug, LifeProjectInfo>;

export type ProjectSlug = CanonicalProjectSlug;

export function isProjectSlug(slug: string): slug is ProjectSlug {
  return canonicalIsProjectSlug(slug);
}
