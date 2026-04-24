/**
 * Life subsystem health contract.
 *
 * The Dock at the bottom of /life/[project] used to show hardcoded green
 * pills for five Rust daemons (Arcan:3000, Lago:8080, …) that aren't
 * actually deployed on broomva.tech. This module replaces that fiction
 * with a truthful status map covering:
 *
 * - What is REAL in the current deploy (Vercel AI Gateway, Neon Postgres,
 *   Prosopon wire, Haima billing)
 * - What is SIMULATED at the edge (Nous composite score, Autonomic arcs,
 *   Lago as a separate service)
 * - What is NOT-DEPLOYED yet but on the roadmap (lifed kernel daemon,
 *   Arcan/Lago/Nous as separable services, Prosopon compositor daemon)
 *
 * The status map is produced by `/api/life/health` (see that route for
 * the real probes). The Dock subscribes to it via fetch + polling.
 */

import { PROTOCOL_VERSION } from "@broomva/prosopon";

/**
 * IR schema version — mirrors `prosopon_core::IR_SCHEMA_VERSION` in
 * `core/prosopon/crates/prosopon-core/src/lib.rs`. When the Rust const
 * bumps, bump this string to match. (Adding a public export to
 * @broomva/prosopon is a low-priority follow-up — the version isn't
 * imported anywhere else in this codebase.)
 */
const IR_SCHEMA_VERSION = "0.2.0" as const;

/**
 * Service status — the lifecycle is:
 *
 * - `live`         — running in this deploy, responds to probes.
 * - `simulated`    — has a stand-in in this deploy (e.g. Postgres subs
 *                    for the Lago Rust service; `SYSTEM_PREFIX` subs for
 *                    the Arcan daemon's full agent loop).
 * - `not-deployed` — intentionally absent from this deploy; on roadmap.
 * - `degraded`     — running but an essential dependency is unreachable
 *                    (probe returned an error but the service didn't 5xx).
 * - `down`         — expected to be live and failed its probe.
 */
export type LifeServiceStatus =
  | "live"
  | "simulated"
  | "not-deployed"
  | "degraded"
  | "down";

export interface LifeService {
  /** Stable id, used as React key + data-attr. */
  id: string;
  /** Short display label. */
  label: string;
  /** Status at the time the health snapshot was taken. */
  status: LifeServiceStatus;
  /**
   * Human-readable qualifier. Shown in the Dock's tooltip / hover, e.g.
   * "gpt-5-mini via AI Gateway", "crate pending", "Phase 1 in plan".
   */
  detail?: string;
}

export interface LifeHealth {
  /** ISO timestamp — identifies snapshot freshness. */
  ts: string;
  /** Environment the health snapshot applies to. */
  env: "development" | "preview" | "production" | "unknown";
  /** Deploy commit SHA (first 7 chars) when available. */
  commit?: string;
  /** Service roster. Order controls render order in the Dock. */
  services: LifeService[];
  /** Prosopon wire + IR versions — single source of truth for the frontend. */
  prosopon: {
    protocolVersion: number;
    irSchemaVersion: string;
  };
}

/**
 * Build the health snapshot. Keep this synchronous + cheap — the endpoint
 * wrapping it adds async probes (DB connectivity, etc.) around the result
 * and may degrade individual services.
 */
export function staticHealthSnapshot(): LifeHealth {
  const env = normalizeEnv(process.env.VERCEL_ENV);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  // Attribution of each Life subsystem to its current backing. Keep this
  // list + order aligned with the Dock's render. When Arcan / Lago / Nous
  // eventually ship as deployed services, flip `status` to `live` and
  // update `detail` — no client-side change required.
  const services: LifeService[] = [
    {
      id: "prosopon",
      label: "Prosopon",
      status: "live",
      detail: `wire v${PROTOCOL_VERSION} · IR ${IR_SCHEMA_VERSION}`,
    },
    {
      id: "ai-gateway",
      label: "AI Gateway",
      status: "live",
      detail: "gpt-5-mini",
    },
    {
      id: "arcan",
      label: "Arcan",
      status: "simulated",
      detail: "AI SDK streamText acts as runtime",
    },
    {
      id: "lago",
      label: "Lago",
      status: "simulated",
      detail: "Postgres LifeRunEvent stores events",
    },
    {
      id: "autonomic",
      label: "Autonomic",
      status: "simulated",
      detail: "economic pillar live; others derived",
    },
    {
      id: "haima",
      label: "Haima",
      status: "live",
      detail: "cost + rail via billing module",
    },
    {
      id: "nous",
      label: "Nous",
      status: "simulated",
      detail: "hardcoded score · crate pending",
    },
    {
      id: "lifed",
      label: "lifed",
      status: "not-deployed",
      detail: "kernel · Phase 0 shipped · Phase 1 in plan",
    },
  ];

  return {
    ts: new Date().toISOString(),
    env,
    commit,
    services,
    prosopon: {
      protocolVersion: PROTOCOL_VERSION,
      irSchemaVersion: IR_SCHEMA_VERSION,
    },
  };
}

function normalizeEnv(raw: string | undefined): LifeHealth["env"] {
  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  if (raw === "development") return "development";
  return "unknown";
}
