// Mapping between URL slug → seed project metadata + replay scenario.
// For Phase A only the two demo projects below are valid; everything else 404s.
// Phase C will add user-created projects via /life/new.

import type { ScenarioId } from "./types";

export type ProjectChipColor = "emerald" | "amber";

export interface LifeProjectInfo {
  scenarioId: ScenarioId;
  displayName: string;
  eyebrow: string;
  chipColor: ProjectChipColor;
}

export const PROJECTS: Record<string, LifeProjectInfo> = {
  sentinel: {
    scenarioId: "refactor",
    displayName: "Sentinel — property-ops WO audit",
    eyebrow: "sentinel-property-ops · exclusive-rentals",
    chipColor: "emerald",
  },
  materiales: {
    scenarioId: "research",
    displayName: "Materiales Intel — precio unitario en vivo",
    eyebrow: "materiales-intel · _pending-constructora",
    chipColor: "amber",
  },
};

export type ProjectSlug = keyof typeof PROJECTS;

export function isProjectSlug(slug: string): slug is ProjectSlug {
  return Object.hasOwn(PROJECTS, slug);
}
