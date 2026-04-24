// URL slug → seed project metadata. Production projects are always live —
// there is no scripted scenario path anymore. User-created projects can be
// added at runtime via /life/new (Phase C), at which point this registry
// will be merged with a DB-backed list.

export type ProjectChipColor = "emerald" | "amber" | "violet";

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

export const PROJECTS: Record<string, LifeProjectInfo> = {
  sentinel: {
    displayName: "Sentinel — property-ops WO audit",
    eyebrow: "sentinel-property-ops · exclusive-rentals",
    chipColor: "emerald",
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
    displayName: "Materiales Intel — precio unitario en vivo",
    eyebrow: "materiales-intel · _pending-constructora",
    chipColor: "amber",
    emptyTitle: "¿Qué material investigamos?",
    emptyHint:
      "Describe el material (familia, unidad, región) y el agente consulta proveedores colombianos en vivo, con precios citados.",
  },
  "sentinel-paid": {
    displayName: "Sentinel Pro — paid demo",
    eyebrow: "sentinel-property-ops · x402 @ $0.50/run",
    chipColor: "violet",
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
