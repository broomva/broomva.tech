/**
 * Model-id resolution for the edge adapter.
 *
 * Decision D2 (locked in PR-1 of BRO-1208): the adapter accepts BOTH
 * `claude-sonnet-4-20250514` (raw Anthropic id) AND
 * `anthropic/claude-sonnet-4-20250514` (namespaced, AI-SDK-gateway style).
 * Either form normalises to a single canonical id; unknown ids return
 * `null` and the route surfaces a 400 with the Anthropic-shape error body.
 *
 * The match strategy:
 *
 *   1. Strip a single leading `anthropic/` prefix if present.
 *   2. Try exact match against `models.generated.ts` (the registry uses
 *      the `anthropic/<id>` form natively, so we prepend the prefix
 *      back on lookup).
 *   3. If no exact hit AND the id has a trailing `-YYYYMMDD` date stamp
 *      (the canonical Anthropic naming scheme — see model snapshots like
 *      `claude-sonnet-4-20250514`), try the date-stripped form. This lets
 *      callers send today's dated id while the registry tracks the
 *      latest-by-base form.
 *
 * The returned `anthropicId` is what the caller sent (post-prefix-strip)
 * — preserving the snapshot date downstream consumers may care about.
 * The returned `canonical` is the registry hit (used for billing /
 * observability tags).
 */

import "server-only";
import {
  generatedForGateway,
  models as generatedModels,
} from "@/lib/ai/models.generated";

/** Set of registry-known canonical ids (e.g. `anthropic/claude-sonnet-4`). */
const KNOWN_IDS: ReadonlySet<string> = new Set(
  generatedForGateway === "vercel" ? generatedModels.map((m) => m.id) : [],
);

/** Suffix matcher for date-stamped Anthropic ids — `-YYYYMMDD` at the end. */
const DATE_SUFFIX_RE = /-(\d{8})$/;

export interface ResolvedModel {
  /** Registry-canonical id (e.g. `anthropic/claude-sonnet-4`). */
  canonical: string;
  /**
   * The Anthropic-side id the caller sent (post-prefix-strip). May or
   * may not equal `canonical.slice("anthropic/".length)` depending on
   * whether the caller used a date-snapshot id.
   */
  anthropicId: string;
}

/**
 * Resolve a caller-supplied `model` field. Returns `null` if the model
 * is not in the registry — the route translates that into a 400.
 *
 * The function is deliberately namespace-permissive on input but strict
 * on the inner id — `anthropic/anthropic/foo`, `openai/foo`, and other
 * surprising shapes don't match anything in the registry and return
 * `null`. We don't try to be clever about cross-provider aliasing in
 * PR-1; that's PR-2's concern.
 */
export function resolveModel(modelId: string): ResolvedModel | null {
  if (typeof modelId !== "string" || modelId.length === 0) return null;

  // Strip a single leading `anthropic/` prefix. Don't recurse — the
  // resulting id must not itself carry another slash-prefix (signals
  // a typo or cross-provider id we don't handle here).
  const inner = modelId.startsWith("anthropic/")
    ? modelId.slice("anthropic/".length)
    : modelId;

  if (inner.length === 0 || inner.includes("/")) return null;

  const namespaced = `anthropic/${inner}`;

  // 1. Exact match (covers both `anthropic/claude-3.5-sonnet` and
  //    `anthropic/claude-3.5-sonnet-20240620` — both are in the registry).
  if (KNOWN_IDS.has(namespaced)) {
    return { canonical: namespaced, anthropicId: inner };
  }

  // 2. Date-stripped form. The registry tracks `anthropic/claude-sonnet-4`
  //    while callers may send `claude-sonnet-4-20250514`; map back.
  const m = DATE_SUFFIX_RE.exec(inner);
  if (m) {
    const baseInner = inner.slice(0, inner.length - m[0].length);
    const baseNamespaced = `anthropic/${baseInner}`;
    if (KNOWN_IDS.has(baseNamespaced)) {
      // Preserve the caller's dated id — downstream telemetry may want to
      // know the snapshot they pinned to, even if billing uses canonical.
      return { canonical: baseNamespaced, anthropicId: inner };
    }
  }

  return null;
}
