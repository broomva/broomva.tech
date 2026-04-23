"use client";

import { useEffect, useMemo, useState } from "react";
import type { LifeFsNode, LifeFsOp } from "../_lib/types";

/**
 * Build a directory tree exclusively from the paths the agent has touched
 * this session. Replaces the earlier hybrid that merged a static mock tree
 * with live ops — the production surface shows only what actually happened.
 */
function buildTree(opsPaths: string[]): LifeFsNode[] {
  const root: LifeFsNode[] = [];
  const known = new Set<string>();

  const ensurePath = (path: string): void => {
    if (known.has(path)) return;
    const parts = path.split("/").filter(Boolean);
    let siblings: LifeFsNode[] = root;
    let curPath = "";
    for (let i = 0; i < parts.length; i++) {
      curPath = curPath ? `${curPath}/${parts[i]}` : (parts[i] ?? "");
      let node = siblings.find((n) => n.path === curPath);
      if (!node) {
        const isLeaf = i === parts.length - 1;
        node = {
          path: curPath,
          type: isLeaf ? "file" : "dir",
          children: isLeaf ? undefined : [],
        };
        siblings.push(node);
      } else if (!node.children && i < parts.length - 1) {
        node.children = [];
      }
      known.add(curPath);
      if (node.type === "dir") {
        if (!node.children) node.children = [];
        siblings = node.children;
      }
    }
  };

  for (const p of opsPaths) ensurePath(p);
  return root;
}

interface Props {
  fsOps: LifeFsOp[];
  lastOpTs: number;
}

interface FlatRow extends LifeFsNode {
  depth: number;
  op?: { op: string; path: string; childOnly?: boolean };
  isExpanded: boolean;
}

function flattenTree(
  tree: LifeFsNode[],
  opsByPath: Record<string, { op: string; path: string; childOnly?: boolean }>,
  expanded: Record<string, boolean>,
  depth = 0,
  out: FlatRow[] = [],
): FlatRow[] {
  for (const node of tree) {
    const op = opsByPath[node.path];
    out.push({
      ...node,
      depth,
      op,
      isExpanded: expanded[node.path] !== false,
    });
    if (
      node.type === "dir" &&
      expanded[node.path] !== false &&
      node.children
    ) {
      flattenTree(node.children, opsByPath, expanded, depth + 1, out);
    }
  }
  return out;
}

export function FileTree({ fsOps, lastOpTs }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const opsByPath = useMemo(() => {
    const m: Record<string, { op: string; path: string; childOnly?: boolean }> =
      {};
    for (const o of fsOps) m[o.path] = { op: o.op, path: o.path };
    for (const p of Object.keys(m)) {
      const parts = p.split("/");
      for (let i = parts.length - 1; i > 0; i--) {
        const parent = parts.slice(0, i).join("/");
        if (!m[parent]) {
          m[parent] = { op: "touched", path: parent, childOnly: true };
        }
      }
    }
    return m;
  }, [fsOps]);

  // Auto-expand directories whose children have ops.
  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const o of fsOps) {
        const parts = o.path.split("/");
        for (let i = 1; i < parts.length; i++) {
          next[parts.slice(0, i).join("/")] = true;
        }
      }
      return next;
    });
  }, [fsOps]);

  const tree = useMemo(() => buildTree(fsOps.map((o) => o.path)), [fsOps]);
  const rows = flattenTree(tree, opsByPath, expanded);
  // Click on a directory toggles its expansion. `undefined` (never clicked)
  // and `true` (explicitly expanded) both collapse on click; `false` expands.
  const toggle = (p: string) =>
    setExpanded((e) => ({ ...e, [p]: e[p] === false }));

  const lastOp = fsOps[fsOps.length - 1];
  const isRecent = (path: string) =>
    !!lastOp && lastOp.path === path && Date.now() - lastOpTs < 1400;

  if (rows.length === 0) {
    return (
      <div className="pane-empty">
        <div className="pane-empty__title">No files touched yet</div>
        <div className="pane-empty__body">
          File reads and writes performed by the agent during this session
          will appear here as a live tree.
        </div>
      </div>
    );
  }

  return (
    <div className="filetree">
      <div className="filetree__sect">Session · /workspace</div>
      {rows.map((row) => {
        const badge = row.op && !row.op.childOnly ? row.op.op : null;
        const pulsing = isRecent(row.path) && row.type === "file";
        const isActive =
          row.op?.op === "write" || row.op?.op === "create";
        return (
          <div
            key={row.path}
            className={`fnode ${isActive ? "is-active" : ""} ${
              pulsing ? "is-pulsing" : ""
            }`}
            style={{ paddingLeft: 10 + row.depth * 14 }}
            onClick={() => row.type === "dir" && toggle(row.path)}
            onKeyDown={(e) => {
              if (
                (e.key === "Enter" || e.key === " ") &&
                row.type === "dir"
              ) {
                e.preventDefault();
                toggle(row.path);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="fnode__chev">
              {row.type === "dir" ? (row.isExpanded ? "▾" : "▸") : ""}
            </span>
            <span className="fnode__icon">
              {row.type === "dir" ? "▨" : "◻"}
            </span>
            <span className="fnode__name">{row.path.split("/").pop()}</span>
            {badge === "write" && (
              <span className="fnode__badge fnode__badge--mod">mod</span>
            )}
            {badge === "create" && (
              <span className="fnode__badge fnode__badge--add">new</span>
            )}
            {badge === "read" && (
              <span className="fnode__badge fnode__badge--read">read</span>
            )}
            {badge === "delete" && (
              <span className="fnode__badge fnode__badge--del">del</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
