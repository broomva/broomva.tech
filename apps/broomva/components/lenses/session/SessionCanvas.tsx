"use client";

import type { Scene, SceneNode } from "@broomva/prosopon";
import { useEffect, useRef } from "react";
import { IntentRenderer } from "./IntentRenderer";
import { useSceneContext } from "./SceneContext";

interface Props {
  sid: string;
}

/**
 * Center stage — walks the canonical Scene tree in DFS pre-order and
 * dispatches each node to IntentRenderer.
 *
 * Phase 3 finding: the canonical Prosopon `Scene` is `{ id, root: Node, ... }`
 * (a *tree*), not the plan-shaped `{ id, nodes: Node[], meta }` (a flat
 * ordered list). We flatten the tree here so every node — including the
 * root — gets a chance to render. IntentRenderer routes container intents
 * like `section` / `group` through UnknownIntent, which is fine for B-4a
 * (they render a quiet fallback line); typed container rendering lands
 * with the right-rail work in B-4b.
 *
 * Auto-scroll behaviour matches the plan: scroll to bottom when a new
 * node arrives, unless the user has scrolled up more than 80 px from
 * the bottom (in which case we leave the viewport alone so they can
 * read history).
 */
export function SessionCanvas({ sid }: Props) {
  const { scene } = useSceneContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const nodes = flattenNodes(scene.root);
  const nodeCount = nodes.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: nodeCount is the
  // intentional trigger — re-fire only when a new node arrives. Refs we
  // read (scrollRef, userScrolledRef) carry no reactive identity.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [nodeCount]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-16 py-7 pb-5"
      onScroll={(e) => {
        const el = e.currentTarget;
        userScrolledRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight > 80;
      }}
    >
      {nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[13px] opacity-50">
          waiting for first intent…
        </div>
      ) : (
        nodes.map((node) => (
          <IntentRenderer key={node.id} node={node} sid={sid} />
        ))
      )}
    </div>
  );
}

/**
 * Flatten the Scene tree (DFS pre-order) into a node list. Returns []
 * when `root` is undefined so the empty placeholder renders correctly
 * before the first scene_reset arrives.
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
