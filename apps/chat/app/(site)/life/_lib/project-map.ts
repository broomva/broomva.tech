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
   * running the in-browser scenario replay clock.
   */
  liveStream: boolean;
  /** Empty-state title above the composer prompt. */
  emptyTitle?: string;
  /** Empty-state hint describing what the project does. */
  emptyHint?: string;
  /** First-turn suggestions shown as clickable chips. */
  suggestions?: Array<{ label: string; prompt: string }>;
}

export const PROJECTS: Record<string, LifeProjectInfo> = {
  sentinel: {
    scenarioId: "refactor",
    displayName: "Sentinel — property-ops WO audit",
    eyebrow: "sentinel-property-ops · exclusive-rentals",
    chipColor: "emerald",
    liveStream: true,
    emptyTitle: "What should Sentinel audit?",
    emptyHint:
      "Describe a work order, a vendor pattern, or a portfolio you want reviewed. Sentinel flags duplicates, weak closures, follow-up risk, and missing evidence.",
    suggestions: [
      {
        label: "What's a weak closure?",
        prompt:
          "In one sentence, what's a weak closure in property management and how should I spot one?",
      },
      {
        label: "List 3 signs of follow-up risk",
        prompt: "List 3 signs of follow-up risk on a closed work order. Be brief.",
      },
      {
        label: "Draft an audit checklist",
        prompt:
          "Draft a short checklist (5 items) I can run on any closed work order to decide if it needs follow-up.",
      },
    ],
  },
  materiales: {
    scenarioId: "research",
    displayName: "Materiales Intel — precio unitario en vivo",
    eyebrow: "materiales-intel · _pending-constructora",
    chipColor: "amber",
    liveStream: false,
    emptyTitle: "¿Qué material investigamos?",
    emptyHint:
      "Describe el material (familia, unidad, región) y el agente consulta proveedores colombianos en vivo, con precios citados.",
  },
  "sentinel-paid": {
    scenarioId: "refactor",
    displayName: "Sentinel Pro — paid demo",
    eyebrow: "sentinel-property-ops · x402 @ $0.50/run",
    chipColor: "violet",
    liveStream: true,
    emptyTitle: "Sentinel Pro — paid via x402",
    emptyHint:
      "Same audit engine as /life/sentinel. External callers settle $0.50/run via x402 — you'll see the payment approval flow.",
    suggestions: [
      {
        label: "Kick off an audit",
        prompt:
          "Audit the last quarter of closed work orders for a 50-unit property and flag top 3 risks.",
      },
    ],
  },
};

export type ProjectSlug = keyof typeof PROJECTS;

export function isProjectSlug(slug: string): slug is ProjectSlug {
  return Object.hasOwn(PROJECTS, slug);
}
