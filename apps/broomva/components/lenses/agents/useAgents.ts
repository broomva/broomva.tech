"use client";

import { useMemo } from "react";
import { useSceneContextOptional } from "../session/SceneContext";

export type ApprovalMode = "silent" | "review" | "always";

export interface AgentSpec {
  /** Stable id derived from the agents/<id>/spec.md path. */
  id: string;
  /** Full spec.md path. */
  path: string;
  /** Human display name, e.g. "Atlas". */
  name: string;
  /** Archetype label, e.g. "resident", "engineer", "researcher". */
  archetype: string;
  /** One-line description from frontmatter. */
  description?: string;
  /** Model class slug, e.g. "claude-sonnet-4.5". */
  model?: string;
  /** Granted tool prefixes, e.g. ["fs.read", "memory.write"]. */
  grants: string[];
  /** Approval gating policy. */
  approvalMode: ApprovalMode;
  /** Event id of the latest spec write. */
  eventId: string;
}

const SPEC_PATH = /^agents\/([^/]+)\/spec\.md$/;

function normalizeApprovalMode(v: unknown): ApprovalMode {
  if (v === "review" || v === "always") return v;
  return "silent";
}

/**
 * Walk the scene for `fs.write` tool_calls whose path matches
 * `agents/<slug>/spec.md`. Returns one AgentSpec per unique slug (latest
 * write wins). Pure scene-derivation; no extra subscription.
 */
export function useAgents(): AgentSpec[] {
  const { scene } = useSceneContextOptional();

  return useMemo<AgentSpec[]>(() => {
    const byId = new Map<string, AgentSpec>();

    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
      };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      if (discriminator === "tool_call") {
        const name = n.intent?.name ?? n.intent?.tool ?? "";
        if (name === "fs.write" || name === "fs.apply_patch") {
          const path = n.intent?.args?.path;
          if (typeof path === "string") {
            const m = SPEC_PATH.exec(path);
            if (m) {
              const id = m[1];
              const fm =
                (n.intent?.args?.frontmatter as Record<string, unknown>) ?? {};
              byId.set(id, {
                id,
                path,
                name: typeof fm.name === "string" ? fm.name : id,
                archetype:
                  typeof fm.archetype === "string" ? fm.archetype : "agent",
                description:
                  typeof fm.description === "string"
                    ? fm.description
                    : undefined,
                model: typeof fm.model === "string" ? fm.model : undefined,
                grants: Array.isArray(fm.grants)
                  ? fm.grants.filter((g): g is string => typeof g === "string")
                  : [],
                approvalMode: normalizeApprovalMode(fm.approval_mode),
                eventId: n.id,
              });
            }
          }
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };

    const root = (scene as unknown as { root?: unknown }).root;
    if (root) walk(root as never);
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [scene]);
}
