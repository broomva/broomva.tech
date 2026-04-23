// Mapping between URL slug → seed project metadata + replay scenario.
// For Phase A only the two demo projects below are valid; everything else 404s.
// Phase C will add user-created projects via /life/new.

import type { ScenarioId } from "./types";

export type ProjectChipColor = "emerald" | "amber" | "violet";

export interface LifeProjectInfo {
  scenarioId: ScenarioId;
  displayName: string;
  eyebrow: string;
  chipColor: ProjectChipColor;
  /**
   * When true, the shell hits /api/life/run/<slug> over SSE instead of
   * running the in-browser scenario replay clock. Phase 2 flips this on for
   * Sentinel (mock-replay server-side — no Claude cost); Materiales stays
   * client-replay until the OAuth shim migration lands in the next PR.
   */
  liveStream: boolean;
}

export const PROJECTS: Record<string, LifeProjectInfo> = {
  sentinel: {
    scenarioId: "refactor",
    displayName: "Sentinel — property-ops WO audit",
    eyebrow: "sentinel-property-ops · exclusive-rentals",
    chipColor: "emerald",
    liveStream: true,
  },
  materiales: {
    scenarioId: "research",
    displayName: "Materiales Intel — precio unitario en vivo",
    eyebrow: "materiales-intel · _pending-constructora",
    chipColor: "amber",
    liveStream: false,
  },
  "sentinel-paid": {
    scenarioId: "refactor",
    displayName: "Sentinel Pro — paid demo",
    eyebrow: "sentinel-property-ops · x402 @ $0.50/run",
    chipColor: "violet",
    liveStream: true,
  },
};

export type ProjectSlug = keyof typeof PROJECTS;

export function isProjectSlug(slug: string): slug is ProjectSlug {
  return Object.hasOwn(PROJECTS, slug);
}
