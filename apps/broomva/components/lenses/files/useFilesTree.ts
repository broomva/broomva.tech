"use client";

import { useMemo } from "react";
import { useSceneContextOptional } from "../session/SceneContext";

export interface FileEntry {
  /** Full path, e.g. "notes/quickstart.md" */
  path: string;
  /** Just the basename, e.g. "quickstart.md" */
  name: string;
  /** Latest write event id (used as a React key). */
  id: string;
  /** Optional ISO timestamp of the latest write. */
  ts?: string;
}

export interface FolderEntry {
  kind: "folder";
  /** Folder path with trailing slash, e.g. "notes/". Root is "". */
  path: string;
  /** Display name; "/" for root. */
  name: string;
  children: TreeEntry[];
}

export interface FileTreeEntry extends FileEntry {
  kind: "file";
}

export type TreeEntry = FolderEntry | FileTreeEntry;

/**
 * Walk the scene tree for `fs.write` tool_call intents; collapse multiple
 * writes to the same path into a single FileEntry (latest wins); group by
 * directory; return a recursive folder tree sorted alphabetically. Pure
 * scene-derivation, no extra subscription.
 *
 * The hook uses `useSceneContextOptional` so it gracefully degrades to an
 * empty tree when rendered outside the workspace session route (e.g. on
 * `/workspace` landing or in tests without a provider).
 */
export function useFilesTree(): { root: FolderEntry; files: FileEntry[] } {
  const { scene } = useSceneContextOptional();

  return useMemo(() => {
    const byPath = new Map<string, FileEntry>();

    const walk = (n: {
      id: string;
      intent?: {
        type?: string;
        kind?: string;
        name?: string;
        tool?: string;
        args?: Record<string, unknown>;
      };
      attrs?: { ts?: string };
      children?: unknown[];
    }) => {
      const discriminator = n.intent?.type ?? n.intent?.kind;
      if (discriminator === "tool_call") {
        const name = n.intent?.name ?? n.intent?.tool ?? "";
        if (name === "fs.write" || name === "fs.apply_patch") {
          const path = n.intent?.args?.path;
          if (typeof path === "string" && path.length > 0) {
            byPath.set(path, {
              path,
              name: path.split("/").pop() ?? path,
              id: n.id,
              ts: n.attrs?.ts,
            });
          }
        }
      }
      for (const c of (n.children ?? []) as Array<typeof n>) walk(c);
    };

    const root = (
      scene as unknown as {
        root?: {
          id: string;
          intent?: unknown;
          children?: unknown[];
        };
      }
    ).root;
    if (root) walk(root as never);

    const files = Array.from(byPath.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    // Build folder tree by splitting on "/".
    const rootFolder: FolderEntry = {
      kind: "folder",
      path: "",
      name: "/",
      children: [],
    };

    const folderByPath = new Map<string, FolderEntry>();
    folderByPath.set("", rootFolder);

    const ensureFolder = (folderPath: string): FolderEntry => {
      const cached = folderByPath.get(folderPath);
      if (cached) return cached;
      const segments = folderPath.split("/").filter(Boolean);
      const parentPath = segments.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath);
      const folder: FolderEntry = {
        kind: "folder",
        path: folderPath,
        name: segments[segments.length - 1] ?? "/",
        children: [],
      };
      parent.children.push(folder);
      folderByPath.set(folderPath, folder);
      return folder;
    };

    for (const f of files) {
      const segments = f.path.split("/");
      const parentPath = segments.slice(0, -1).join("/");
      const parent = ensureFolder(parentPath);
      parent.children.push({
        kind: "file",
        ...f,
      });
    }

    // Sort each folder's children: folders first, files second; alphabetical
    // within each group.
    const sort = (folder: FolderEntry) => {
      folder.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const c of folder.children) {
        if (c.kind === "folder") sort(c);
      }
    };
    sort(rootFolder);

    return { root: rootFolder, files };
  }, [scene]);
}
