import { z } from "zod";

/** Locale identifiers we actively support. */
export const LocaleSchema = z.enum(["en-CA", "en-US", "es-CO"]);
export type Locale = z.infer<typeof LocaleSchema>;

/** Currencies we expose in reports / billing. */
export const CurrencySchema = z.enum(["USD", "CAD", "COP", "USDC"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const TenantContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  locale: LocaleSchema,
  currency: CurrencySchema,
  region: z.string(),
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  fetchedAt: z.string().datetime(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ToolCallRecordSchema = z.object({
  name: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  errored: z.boolean().default(false),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

/**
 * Tenant rules manifest — sits at `rules-package/manifest.json`.
 *
 * Supports two shapes:
 *   1. Canonical:      { module, moduleVersion, rulesVersion, ... }
 *   2. Freelance skel: { module_id: "name@1.0.0", version: "0.0.0", id, name, extends? }
 *
 * Preprocessor normalizes (2) into (1) so both flavours parse. Extra fields
 * (`id`, `name`, `owner`, `extends`, `created_at`, `signature`, etc.) pass
 * through via `.passthrough()` and remain available to consumers.
 */
const RulesManifestNormalizedSchema = z
  .object({
    $schema: z.string().optional(),
    tenantId: z.string().optional(),
    module: z.string(),
    moduleVersion: z.string(),
    rulesVersion: z.string(),
    updatedAt: z.string().optional(),
    maintainer: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const RulesManifestSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...r };
  if (out.module === undefined || out.moduleVersion === undefined) {
    const moduleId = r.module_id;
    if (typeof moduleId === "string") {
      const [name, ver] = moduleId.split("@");
      if (out.module === undefined && name) out.module = name;
      if (out.moduleVersion === undefined && ver) out.moduleVersion = ver;
    }
  }
  if (out.rulesVersion === undefined && typeof r.version === "string") {
    out.rulesVersion = r.version;
  }
  if (out.tenantId === undefined && typeof r.id === "string") {
    out.tenantId = r.id;
  }
  return out;
}, RulesManifestNormalizedSchema);
export type RulesManifest = z.infer<typeof RulesManifestSchema>;

/** Parsed tenant rules-package/ directory contents. */
export interface RulesPackage {
  dir: string;
  manifest: RulesManifest;
  taxonomy?: Record<string, unknown>;
  sources?: Record<string, unknown>;
  rules: Record<string, unknown>;
  schemas: Record<string, unknown>;
  prompts: Record<string, string>;
  policy: Record<string, unknown>;
  fixtures: Record<string, unknown>;
}
