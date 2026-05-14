"use client";

import { useMemo } from "react";
import { useSceneContext } from "../SceneContext";

interface ContextCard {
  key: string;
  kind: "file" | "memory" | "agent";
  name: string;
  desc?: string;
}

/**
 * InContextCards — derives "what's in context right now" from the scene.
 *
 * Scans the tree for:
 *   - tool_call.args.path on fs.* tools     → file card
 *   - tool_call.args.scope on memory.*     → memory card
 *   - entity_ref intents                    → memory card
 *   - session actor (scene.hints.agent)     → agent card
 *
 * Dedupes by (kind, name). Shows up to 5; rest collapsed under "+ N more".
 * Pure client-side derivation; no extra RPCs.
 */
export function InContextCards() {
  const { scene } = useSceneContext();

  const cards = useMemo<ContextCard[]>(() => {
    const found = new Map<string, ContextCard>();
    const add = (c: ContextCard) => {
      if (!found.has(c.key)) found.set(c.key, c);
    };

    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
        label?: string;
        id?: string;
      };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      const intent = n.intent;
      if (!intent) return;

      if (discriminator === "tool_call") {
        const name = intent.name ?? intent.tool ?? "";
        const path = (intent.args?.path as string | undefined) ?? "";
        if (name.startsWith("fs.") && path) {
          add({
            key: `file:${path}`,
            kind: "file",
            name: path,
            desc: `via ${name}`,
          });
        }
        const scope = (intent.args?.scope as string | undefined) ?? "";
        if (name.startsWith("memory.") && scope) {
          add({
            key: `memory:${scope}`,
            kind: "memory",
            name: scope,
            desc: `via ${name}`,
          });
        }
      }
      if (discriminator === "entity_ref") {
        const label = intent.label ?? intent.id ?? "";
        if (label) {
          add({ key: `memory:${label}`, kind: "memory", name: label });
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };

    const root = (
      scene as unknown as { root?: { intent?: unknown; children?: unknown[] } }
    ).root;
    if (root) walk(root as never);

    // Add the session's actor as an agent card if hinted in the scene.
    const hints = (
      scene as unknown as { hints?: { agent?: string; agent_role?: string } }
    ).hints;
    if (hints?.agent) {
      add({
        key: `agent:${hints.agent}`,
        kind: "agent",
        name: hints.agent,
        desc: hints.agent_role,
      });
    }

    return Array.from(found.values());
  }, [scene]);

  if (cards.length === 0) {
    return (
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">
        Start a session to populate context.
      </div>
    );
  }

  const visible = cards.slice(0, 5);
  const extra = cards.length - visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      {visible.map((c) => (
        <div
          key={c.key}
          className="ag-glass-subtle rounded-md border border-white/10 px-2.5 py-2"
        >
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span
              aria-hidden
              style={{
                color:
                  c.kind === "file"
                    ? "var(--ag-ai-blue)"
                    : c.kind === "memory"
                      ? "var(--ag-accent-blue)"
                      : "var(--ag-warning)",
              }}
            >
              {c.kind === "file" ? "▤" : c.kind === "memory" ? "◇" : "◉"}
            </span>
            <span className="truncate">{c.name}</span>
            <span className="ml-auto text-[9.5px] opacity-50">{c.kind}</span>
          </div>
          {c.desc && (
            <div className="mt-1 text-[11px] leading-[1.5] opacity-65">
              {c.desc}
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="px-1 font-mono text-[10px] opacity-55">
          + {extra} more
        </div>
      )}
    </div>
  );
}
