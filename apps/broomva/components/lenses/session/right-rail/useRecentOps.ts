"use client";

import { useMemo } from "react";
import { useSceneContextOptional } from "../SceneContext";

export interface OpEntry {
  id: string;
  kind: "fs" | "memory" | "run" | "policy" | "payment";
  label: string;
  arg?: string;
  ts?: number;
  source?: string;
}

const OPS_FILTER = new Set([
  "fs.read",
  "fs.write",
  "fs.list",
  "fs.search",
  "fs.apply_patch",
  "memory.query",
  "memory.write",
  "memory.touch",
  "memory.link",
  "bash",
  "run.start",
  "run.end",
  "run.heartbeat",
  "policy.grant",
  "policy.deny",
  "policy.review",
  "payment.debit",
  "payment.credit",
]);

function kindOf(name: string): OpEntry["kind"] {
  if (name.startsWith("fs.") || name === "bash") return "fs";
  if (name.startsWith("memory.")) return "memory";
  if (name.startsWith("run.")) return "run";
  if (name.startsWith("policy.")) return "policy";
  if (name.startsWith("payment.")) return "payment";
  return "fs";
}

/**
 * Derives a recent-operations list from the current scene by walking the
 * tree pre-order, finding tool_call intents whose name matches the ops
 * filter, and emitting an OpEntry per match. Newest-first; capped at 14.
 *
 * The list updates reactively when the scene reducer applies new
 * tool_call envelopes — the hook is a pure derivation, no separate
 * subscription.
 */
export function useRecentOps(): OpEntry[] {
  const { scene } = useSceneContextOptional();
  return useMemo<OpEntry[]>(() => {
    const out: OpEntry[] = [];
    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
      };
      attrs?: { source?: string; ts?: number };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      if (discriminator === "tool_call") {
        const name = n.intent?.name ?? n.intent?.tool ?? "";
        if (
          OPS_FILTER.has(name) ||
          name.startsWith("fs.") ||
          name.startsWith("memory.")
        ) {
          const firstArg = n.intent?.args
            ? Object.values(n.intent.args).find((v) => typeof v === "string")
            : undefined;
          out.push({
            id: n.id,
            kind: kindOf(name),
            label: name,
            arg:
              typeof firstArg === "string" ? firstArg.slice(0, 60) : undefined,
            ts: n.attrs?.ts,
            source: n.attrs?.source,
          });
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };
    const root = (
      scene as unknown as {
        root?: {
          id: string;
          intent?: { type?: string; kind?: string };
          children?: unknown[];
        };
      }
    ).root;
    if (root) walk(root as never);
    // Newest first (reverse pre-order: latest descendants are usually
    // emitted last, so we reverse the walk result).
    return out.reverse().slice(0, 14);
  }, [scene]);
}
