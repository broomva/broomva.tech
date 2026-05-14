"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { type FolderEntry, type TreeEntry, useFilesTree } from "./useFilesTree";

/**
 * FilesTree — always-visible recursive folder tree mounted in `LeftRail`.
 * Clicking a file writes `?file=<path>` to the URL, activating the Files
 * lens. The tree itself stays mounted regardless of which lens is active.
 *
 * Folders start collapsed except the root; click chevron to toggle.
 */
export function FilesTree() {
  const { root, files } = useFilesTree();

  if (files.length === 0) {
    return (
      <div className="px-1 py-2 font-mono text-[11px] opacity-60">Empty.</div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-1 font-mono text-[11px]">
      {root.children.map((child) => (
        <TreeRow key={`${child.kind}:${child.path}`} entry={child} depth={0} />
      ))}
    </div>
  );
}

function TreeRow({ entry, depth }: { entry: TreeEntry; depth: number }) {
  if (entry.kind === "folder") {
    return <FolderRow folder={entry} depth={depth} />;
  }
  return <FileRow path={entry.path} name={entry.name} depth={depth} />;
}

function FolderRow({ folder, depth }: { folder: FolderEntry; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-left opacity-80 hover:bg-[color:var(--ag-bg-hover)] hover:opacity-100"
        style={{ paddingLeft: `${depth * 10 + 4}px` }}
      >
        <span aria-hidden className="w-3 text-[9px] opacity-60">
          {open ? "▾" : "▸"}
        </span>
        <span aria-hidden style={{ color: "var(--ag-text-muted)" }}>
          ▤
        </span>
        <span className="truncate">{folder.name}</span>
      </button>
      {open && (
        <div>
          {folder.children.map((child) => (
            <TreeRow
              key={`${child.kind}:${child.path}`}
              entry={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FileRow({
  path,
  name,
  depth,
}: {
  path: string;
  name: string;
  depth: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isActive = params.get("file") === path;

  const onClick = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.set("file", path);
    router.push(`${pathname}?${next.toString()}` as Route);
  }, [path, params, pathname, router]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-[color:var(--ag-bg-hover)] ${
        isActive ? "bg-[color:var(--ag-bg-hover)] opacity-100" : "opacity-75"
      }`}
      style={{ paddingLeft: `${depth * 10 + 18}px` }}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        aria-hidden
        className="opacity-60"
        style={{ color: "var(--ag-ai-blue)" }}
      >
        ◆
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}
