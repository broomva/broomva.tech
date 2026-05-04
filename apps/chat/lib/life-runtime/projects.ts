/**
 * Canonical Life-project registry — single source of truth for
 * every `/life/[slug]` route on broomva.tech.
 *
 * Adding a new project = a single PR, single file edit. The registry
 * drives:
 *
 *   - The dynamic route guard at `/life/[project]` (slug validation).
 *   - The chat composer's empty-state copy + suggestion chips.
 *   - The /life landing page's project picker cards.
 *   - The agent runtime's system prompt + model + tool allowlist.
 *   - The DB seed script (idempotent upsert into `LifeProject`).
 *   - The health-endpoint default service roster (for SIM/LIVE Dock).
 *
 * The DB row owns the operational identity (id, ownerKind, pricing
 * config, currentRulesVersionId, stats). The registry owns the
 * configuration the runtime reads on every turn. Bridge:
 * `seedProjectsToDb()` in `db-seed.ts` keeps DB rows in sync with
 * the registry.
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import { z } from "zod";
import type { AppModelId } from "@/lib/ai/app-model-id";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Slug pattern — kebab-case, 3-64 chars, alphanumeric with internal
 * hyphens. Matches the DB unique constraint and is safe to use in URL
 * path segments without encoding.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

const SUGGESTION_SCHEMA = z.object({
  label: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2000),
});

const BILLING_SCHEMA = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("free"),
  }),
  z.object({
    mode: z.literal("credits"),
    /**
     * Approximate cost in USD cents per run. Used as the credit-debit
     * estimate AND as the maxCostCents cap so the runner aborts on
     * runaway costs.
     */
    pricePerRunCents: z.number().int().nonnegative().max(50_000),
  }),
  z.object({
    mode: z.literal("x402"),
    pricePerRunCents: z.number().int().nonnegative().max(50_000),
    /** CAIP-2 chain id (e.g. `eip155:8453` for Base mainnet). */
    railChainId: z.string().regex(/^[a-z0-9]+:[A-Za-z0-9_-]+$/),
  }),
]);

const PROJECT_CONFIG_SCHEMA = z.object({
  /** URL slug. MUST match the registry key. */
  slug: z.string().regex(SLUG_PATTERN),
  /** Human-readable name. Shown in tabs, settings, audit logs. */
  displayName: z.string().min(1).max(120),
  /** One-line description for cards, audit, OG meta. */
  description: z.string().min(1).max(280),
  /**
   * Foreign key into `LifeModuleType.id`. Determines the system-prompt
   * family + tool surface the runner exposes. New module types require
   * a separate migration adding the row to `LifeModuleType` first.
   */
  moduleTypeId: z.string().regex(/^[a-z][a-z0-9-]+$/),
  /**
   * The agent's persona / instructions. Composed with the runtime's
   * project-suffix at request time (project name, slug, env).
   */
  systemPrompt: z.string().min(1).max(8000),
  /** Default AI Gateway model id. Per-run overrides land in v2. */
  defaultModel: z.string().min(1).max(120),
  /**
   * Tools this project's runner may dispatch. Tool handlers are
   * resolved against `makeLifeToolHandlers` in `real-runner.ts`;
   * unknown names fail fast on registry boot.
   */
  toolAllowlist: z.array(z.string().min(1).max(64)).max(32),
  /** Billing config. Determines the 402 path + credits debit. */
  billing: BILLING_SCHEMA,
  /** Render-side bits: chip color, eyebrow, suggestions. */
  ui: z.object({
    /** Pill color for the project picker card + workspace tab. */
    chipColor: z.enum(["emerald", "amber", "violet", "blue", "rose"]),
    /** Mono breadcrumb shown above the workspace title. */
    eyebrow: z.string().min(1).max(120),
    /** Big label above the empty-state composer. Default: displayName. */
    emptyTitle: z.string().min(1).max(120).optional(),
    /** Subtitle in the empty state. Default: description. */
    emptyHint: z.string().min(1).max(400).optional(),
    /** Quick-prompt chips shown below the composer on first turn. */
    suggestions: z.array(SUGGESTION_SCHEMA).max(8).optional(),
  }),
  /**
   * Visibility for the project picker. `public` shows on the /life
   * landing page; `unlisted` is reachable by direct URL only;
   * `private` 404s for non-owners.
   */
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});

export type ProjectConfig = z.infer<typeof PROJECT_CONFIG_SCHEMA>;

// ---------------------------------------------------------------------------
// Registry — defined as object literal; helper validates each entry +
// fails fast at module load if any entry is malformed (so a bad PR
// can't even reach a test run).
// ---------------------------------------------------------------------------

function defineProjects<TKeys extends string>(
  entries: Record<TKeys, ProjectConfig>,
): Record<TKeys, ProjectConfig> {
  for (const [key, cfg] of Object.entries(entries) as Array<
    [TKeys, ProjectConfig]
  >) {
    PROJECT_CONFIG_SCHEMA.parse(cfg);
    if (cfg.slug !== key) {
      throw new Error(
        `Project registry: slug "${cfg.slug}" does not match registry key "${key}"`,
      );
    }
  }
  return entries;
}

export const PROJECTS = defineProjects({
  // ─────────────────────────────────────────────────────────────────
  // Sentinel — property-ops work-order auditor (free demo).
  // ─────────────────────────────────────────────────────────────────
  sentinel: {
    slug: "sentinel",
    displayName: "Sentinel — property-ops WO audit",
    description:
      "AI-native work-order auditor: flags duplicates, weak closures, follow-up risk, and missing evidence on closed property work orders.",
    moduleTypeId: "sentinel-property-ops",
    systemPrompt: [
      "You are Sentinel, an AI-native work-order auditor for property managers.",
      "You flag duplicate work orders, weak closures, follow-up risk, and missing evidence.",
      "When the user asks you to audit, call the `note` tool to record each finding to the workspace.",
      "Be direct. Name the property + unit when you flag something. Use short crisp sentences.",
    ].join("\n"),
    defaultModel: "openai/gpt-5-mini" satisfies AppModelId,
    toolAllowlist: ["note"],
    billing: { mode: "free" },
    ui: {
      chipColor: "emerald",
      eyebrow: "sentinel-property-ops · exclusive-rentals",
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
          prompt:
            "List 3 signs of follow-up risk on a closed work order. Be brief.",
        },
        {
          label: "Draft an audit checklist",
          prompt:
            "Draft a short checklist (5 items) I can run on any closed work order to decide if it needs follow-up.",
        },
      ],
    },
    visibility: "public",
  },

  // ─────────────────────────────────────────────────────────────────
  // Materiales Intel — live construction-material price research (CO).
  // ─────────────────────────────────────────────────────────────────
  materiales: {
    slug: "materiales",
    displayName: "Materiales Intel — precio unitario en vivo",
    description:
      "Investigación en vivo de precios unitarios de materiales de construcción en Colombia. Cita proveedores y deja una hoja de ruta auditable.",
    moduleTypeId: "materiales-intel",
    systemPrompt: [
      "You are Materiales Intel, an AI agent that researches construction-material unit prices in Colombia.",
      "You run live research — do not claim to have prices cached. Cite supplier sites.",
      "Respond in the same language the user writes (default Spanish).",
      "Use `note` to persist findings to the workspace.",
    ].join("\n"),
    defaultModel: "openai/gpt-5-mini" satisfies AppModelId,
    toolAllowlist: ["note"],
    billing: { mode: "free" },
    ui: {
      chipColor: "amber",
      eyebrow: "materiales-intel · _pending-constructora",
      emptyTitle: "¿Qué material investigamos?",
      emptyHint:
        "Describe el material (familia, unidad, región) y el agente consulta proveedores colombianos en vivo, con precios citados.",
    },
    visibility: "public",
  },

  // ─────────────────────────────────────────────────────────────────
  // Sentinel Pro — paid x402 demo (same engine, $0.50/run).
  // ─────────────────────────────────────────────────────────────────
  "sentinel-paid": {
    slug: "sentinel-paid",
    displayName: "Sentinel Pro — paid demo",
    description:
      "Same audit engine as /life/sentinel, settled per-run via x402 (USDC on Base). Demonstrates the agent-pays-agent flow.",
    moduleTypeId: "sentinel-property-ops",
    systemPrompt: [
      "You are Sentinel, an AI-native work-order auditor for property managers.",
      "This is the paid Pro tier — be more rigorous, cite tool outputs by file path.",
      "When the user asks you to audit, call the `note` tool to record each finding.",
      "Be direct. Use short crisp sentences.",
    ].join("\n"),
    defaultModel: "openai/gpt-5-mini" satisfies AppModelId,
    toolAllowlist: ["note"],
    billing: {
      mode: "x402",
      pricePerRunCents: 50,
      railChainId: "eip155:8453",
    },
    ui: {
      chipColor: "violet",
      eyebrow: "sentinel-property-ops · x402 @ $0.50/run",
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
    visibility: "public",
  },
} as const);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Type-safe slug union. Compile-time exhaustive — adding a registry
 *  entry automatically updates this type. */
export type ProjectSlug = keyof typeof PROJECTS;

/** Convenience: array of all registered slugs. */
export const PROJECT_SLUGS: readonly ProjectSlug[] = Object.keys(
  PROJECTS,
) as ProjectSlug[];

/** Type guard for string → ProjectSlug. */
export function isProjectSlug(slug: string): slug is ProjectSlug {
  return Object.hasOwn(PROJECTS, slug);
}

/** Resolve a config by slug. Throws on unknown slug — callers MUST
 *  guard with `isProjectSlug` first. */
export function getProjectConfig(slug: ProjectSlug): ProjectConfig {
  const cfg = PROJECTS[slug];
  if (!cfg) {
    throw new Error(`getProjectConfig: unknown slug "${slug}"`);
  }
  return cfg;
}

/** Listing helper for the /life landing page. Filters by visibility. */
export function listPublicProjects(): ProjectConfig[] {
  return PROJECT_SLUGS.map((s) => PROJECTS[s]).filter(
    (p) => p.visibility === "public",
  );
}

// ---------------------------------------------------------------------------
// Dev-only schema export — used by tests + DB seed script. Production
// code should use the typed helpers above.
// ---------------------------------------------------------------------------

export const PROJECT_CONFIG_SCHEMA_FOR_TESTS = PROJECT_CONFIG_SCHEMA;
