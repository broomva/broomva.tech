"use client";

import type { Scene, SceneNode } from "@broomva/prosopon";
import { useSceneContext } from "./SceneContext";

interface Props {
  sid: string;
}

/**
 * Header for the session canvas — title + agent badge + meta line.
 *
 * The canonical Prosopon `Scene` is `{ id, root, signals?, hints? }` and
 * carries no `meta` field. The plan's verbatim code assumed a plan-shaped
 * `scene.meta` extension; we read it through an `unknown` cast so the
 * component degrades gracefully on canonical scenes:
 *
 *   - title:    `meta.title` if present, else "Untitled session"
 *   - agent:    badge rendered only when `meta.agent` is present
 *   - turns:    `meta.turns` if present, else number of flattened nodes
 *   - sid8:     first 8 chars of `scene.id` (canonical) or `sid` (fallback)
 *
 * This matches Phase 3's pattern of casting through `unknown` to read
 * plan-level extension fields without breaking the canonical type contract.
 */
export function SessionHeader({ sid }: Props) {
  const { scene, connected, lastSeq } = useSceneContext();
  const meta =
    (
      scene as unknown as {
        meta?: {
          title?: string;
          agent?: string;
          turns?: number;
          opened_at?: string;
        };
      }
    ).meta ?? {};
  const sidForDisplay = scene.id || sid;
  const turnCount = meta.turns ?? flattenNodes(scene.root).length;
  return (
    <div className="border-b border-white/[0.04] px-8 py-[18px] pb-3.5">
      <div className="flex items-center gap-3">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: connected
              ? "var(--ag-success)"
              : "var(--ag-text-muted)",
            boxShadow: connected ? "0 0 8px rgba(34,197,94,.6)" : undefined,
          }}
        />
        <span
          className="text-[18px] tracking-[-0.01em]"
          style={{ fontFamily: "CalSans, ui-sans-serif, system-ui" }}
        >
          {meta.title ?? "Untitled session"}
        </span>
        {meta.agent && (
          <span className="ag-glass-subtle rounded border border-[color:var(--ag-ai-blue)]/25 px-2 py-0.5 text-[10px] text-[color:var(--ag-ai-blue)]">
            {meta.agent}
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] opacity-50">
          {sidForDisplay.slice(0, 8)} · {turnCount} turns · seq=
          {lastSeq.toString()}
        </span>
      </div>
    </div>
  );
}

/**
 * Flatten the canonical Scene tree (DFS pre-order) into a node list for
 * counting / iteration. Shared with SessionCanvas; kept inline here to
 * avoid an extra module for a 7-line helper.
 */
function flattenNodes(root: Scene["root"] | undefined): SceneNode[] {
  if (!root) return [];
  const out: SceneNode[] = [];
  const walk = (n: SceneNode): void => {
    out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}
