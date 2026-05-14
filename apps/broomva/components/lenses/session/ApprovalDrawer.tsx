"use client";

import { useMemo } from "react";
import { useSceneContext } from "./SceneContext";

interface PendingApproval {
  nodeId: string;
  dispatchId: string;
  summary: string;
}

/**
 * ApprovalDrawer — right-rail tray surfaced when the scene has ≥2 pending
 * approvals. Each entry expands to scroll the canvas to its inline card.
 * Single approvals render only inline (ApprovalRequiredIntent); the tray
 * is hidden in that case to avoid duplicating the surface.
 */
export function ApprovalDrawer() {
  const { scene } = useSceneContext();

  const pending = useMemo<PendingApproval[]>(() => {
    const found: PendingApproval[] = [];
    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        dispatch_id?: string;
        summary?: string;
      };
      children?: unknown[];
    }) => {
      const kind = n.intent?.type ?? n.intent?.kind;
      if (kind === "approval_required" && n.intent?.dispatch_id) {
        found.push({
          nodeId: n.id,
          dispatchId: n.intent.dispatch_id,
          summary: n.intent.summary ?? "(no summary)",
        });
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };
    const root = (
      scene as unknown as {
        root?: {
          id: string;
          intent?: {
            type?: string;
            kind?: string;
            dispatch_id?: string;
            summary?: string;
          };
          children?: unknown[];
        };
      }
    ).root;
    if (root) walk(root);
    return found;
  }, [scene]);

  if (pending.length < 2) return null;

  return (
    <div className="fixed top-[60px] right-[336px] z-30 w-[300px] -translate-x-2">
      <div className="ag-glass-heavy rounded-lg border border-[color:var(--ag-warning)]/25 bg-[color:var(--ag-warning)]/[0.06] p-3 shadow-lg">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--ag-warning)]">
            {pending.length} approvals pending
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {pending.map((p) => (
            <li key={p.nodeId}>
              <button
                type="button"
                onClick={() => {
                  const el =
                    typeof document !== "undefined"
                      ? document.getElementById(`intent-${p.nodeId}`)
                      : null;
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                className="block w-full truncate rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-left font-mono text-[10.5px] hover:bg-[color:var(--ag-bg-hover)]"
              >
                <span className="opacity-50">▸ </span>
                <span>{p.summary.slice(0, 80)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
