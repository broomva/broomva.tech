"use client";

import { useMemo } from "react";
import { useSceneContextOptional } from "../session/SceneContext";

export interface FileRecord {
  path: string;
  /** Inline markdown body (v1-stub embedded content). */
  content: string;
  /** Parsed YAML-front-matter fields, normalized loosely. */
  frontmatter: {
    kind?: string;
    tags?: string[];
    created?: string;
    updated?: string;
  };
  /** Event id of the latest fs.write for this path. */
  id: string;
}

/**
 * Walk the scene for the latest `fs.write` tool_call whose `args.path`
 * matches. Returns the file's inline content + frontmatter, or null when
 * the path isn't present in the scene.
 *
 * "Latest wins" semantics: a scene tree visitor finds every matching write
 * and the LAST one in pre-order traversal is returned (Prosopon's
 * applyEvent appends new node_added under the root, so later writes are
 * later in the children array).
 */
export function useFile(path: string | undefined): FileRecord | null {
  const { scene } = useSceneContextOptional();

  return useMemo(() => {
    if (!path) return null;

    let latest: FileRecord | null = null;

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
          const args = n.intent?.args ?? {};
          if (args.path === path) {
            const content =
              typeof args.content === "string" ? args.content : "";
            const fm = (args.frontmatter as FileRecord["frontmatter"]) ?? {};
            latest = {
              path,
              content,
              frontmatter: {
                kind: fm.kind,
                tags: Array.isArray(fm.tags) ? fm.tags : undefined,
                created: fm.created,
                updated: fm.updated,
              },
              id: n.id,
            };
          }
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };

    const root = (scene as unknown as { root?: unknown }).root;
    if (root) walk(root as never);
    return latest;
  }, [scene, path]);
}
