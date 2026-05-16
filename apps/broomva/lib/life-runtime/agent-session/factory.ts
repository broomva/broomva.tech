/**
 * AgentSessionClient factory.
 *
 * Picks between `InProcessAgentSessionClient` (default) and
 * `LifedWsAgentSessionClient` based on `LIFED_GATEWAY_URL`. Mirrors
 * the existing `kernel/factory.ts` pattern so swapping backends is
 * a config flip, not a refactor.
 *
 * The factory also reads `LIFED_HEALTH_TIMEOUT_MS` (default 2000)
 * for the lifegw `/healthz` probe, and `LIFED_DISABLED=1` as an
 * explicit kill-switch (forces in-process even when
 * `LIFED_GATEWAY_URL` is set — useful for debugging, never in
 * production).
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import "server-only";
import { resolveProjectBySlug } from "../db-seed";
import {
  InProcessAgentSessionClient,
  type InProcessAgentSessionClientDeps,
} from "./in-process-client";
import {
  LifedWsAgentSessionClient,
  type LifedWsAgentSessionClientDeps,
} from "./lifed-ws-client";
import { type AgentSessionClient } from "./types";

/**
 * Inputs that override the default factory behavior. Intended only
 * for tests + integration scenarios — production code should call
 * `createAgentSessionClient()` with no args.
 */
export interface CreateAgentSessionClientOverrides {
  /** Force a specific backend regardless of env. */
  forceBackendId?: "in-process" | "lifed-ws";
  /** Override LIFED_GATEWAY_URL. */
  lifedGatewayUrl?: string;
  /** Override the in-process deps (project resolution etc.). */
  inProcessDeps?: Partial<InProcessAgentSessionClientDeps>;
  /** Override the lifed-ws deps (WS factory, health probe). */
  lifedWsDeps?: Partial<LifedWsAgentSessionClientDeps>;
}

/**
 * Pick the right `AgentSessionClient` for the current process.
 *
 * Production rules:
 *
 *   - `LIFED_DISABLED=1`               → always in-process
 *   - `LIFED_GATEWAY_URL` set + non-empty → lifed-ws
 *   - otherwise                        → in-process
 *
 * The decision is intentionally synchronous — we don't probe lifed
 * here because (a) the constructor itself shouldn't block on network
 * I/O, and (b) the `/api/life/health` route does the live probe and
 * surfaces it on the Dock. If lifed is unreachable at run time, the
 * `stream()` call yields a typed error event and finishes cleanly.
 */
export function createAgentSessionClient(
  overrides: CreateAgentSessionClientOverrides = {},
): AgentSessionClient {
  const lifedDisabled = process.env.LIFED_DISABLED === "1";
  const lifedUrl =
    overrides.lifedGatewayUrl ?? process.env.LIFED_GATEWAY_URL ?? "";
  const forceBackend = overrides.forceBackendId;

  const wantLifed =
    forceBackend === "lifed-ws" ||
    (forceBackend === undefined && !lifedDisabled && lifedUrl !== "");

  if (wantLifed) {
    if (!lifedUrl) {
      throw new Error(
        "createAgentSessionClient: forceBackendId='lifed-ws' requires LIFED_GATEWAY_URL or overrides.lifedGatewayUrl",
      );
    }
    const deps: LifedWsAgentSessionClientDeps = {
      baseUrl: lifedUrl,
      healthTimeoutMs: parseTimeout(process.env.LIFED_HEALTH_TIMEOUT_MS, 2_000),
      ...overrides.lifedWsDeps,
    };
    return new LifedWsAgentSessionClient(deps);
  }

  const inProcessDeps: InProcessAgentSessionClientDeps = {
    resolveProject: async (slug) => {
      const row = await resolveProjectBySlug(slug);
      if (!row) {
        throw new Error(
          `createAgentSessionClient: unknown project slug "${slug}" (not in registry, not in DB)`,
        );
      }
      return row;
    },
    ...overrides.inProcessDeps,
  };
  return new InProcessAgentSessionClient(inProcessDeps);
}

function parseTimeout(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}
