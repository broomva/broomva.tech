/**
 * Thin wrap over liquidjs — renders a tenant prompt template with:
 *   - `rules`   — the parsed rules package (taxonomy, sources, rules.*, policy, etc.)
 *   - `input`   — the per-run input (a WorkOrder, a MaterialQuery, a fixture batch)
 *   - `tenant`  — TenantContext
 *   - `now`     — ISO-8601 wall clock at render time
 *
 * No custom filters in v1. Default liquidjs filters are sufficient.
 * Fails loud on missing template variables (strictVariables) so a malformed
 * tenant prompt surfaces immediately instead of silently rendering `undefined`.
 */

import { Liquid } from "liquidjs";
import type { TenantContext } from "./types.ts";

let engine: Liquid | undefined;

function getEngine(): Liquid {
  if (!engine) {
    engine = new Liquid({
      strictVariables: false, // keep tolerant; tenants may reference optional sections
      strictFilters: true,
      greedy: false,
    });
  }
  return engine;
}

export interface RenderPromptCtx {
  rules: Record<string, unknown>;
  input?: unknown;
  tenant: TenantContext;
  extra?: Record<string, unknown>;
}

export async function renderPrompt(template: string, ctx: RenderPromptCtx): Promise<string> {
  return getEngine().parseAndRender(template, {
    rules: ctx.rules,
    input: ctx.input ?? null,
    tenant: ctx.tenant,
    now: new Date().toISOString(),
    ...ctx.extra,
  });
}
