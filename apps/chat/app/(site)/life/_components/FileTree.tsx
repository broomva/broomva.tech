"use client";

import { useEffect, useMemo, useState } from "react";
import { LIFE_FS } from "../_lib/mock-workspace";
import type { FsStyle, LifeFsNode, LifeFsOp } from "../_lib/types";

interface Props {
  fsOps: LifeFsOp[];
  fsStyle: FsStyle;
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

export function FileTree({ fsOps, fsStyle, lastOpTs }: Props) {
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

  const rows = flattenTree(LIFE_FS.tree, opsByPath, expanded);
  const toggle = (p: string) =>
    setExpanded((e) => ({ ...e, [p]: e[p] === false ? true : false }));

  const lastOp = fsOps[fsOps.length - 1];
  const isRecent = (path: string) =>
    !!lastOp && lastOp.path === path && Date.now() - lastOpTs < 1400;

  const writingPaths = fsOps
    .filter((o) => o.op === "write" || o.op === "create")
    .slice(-1)
    .map((o) => o.path);

  return (
    <div className="filetree">
      <div className="filetree__sect">Workspace · /workspace</div>
      {rows.map((row) => {
        const badge = row.op && !row.op.childOnly ? row.op.op : null;
        const writing =
          (fsStyle === "heartbeat" || fsStyle === "shimmer") &&
          writingPaths.includes(row.path) &&
          row.type === "file";
        const pulsing =
          (fsStyle === "heartbeat" || fsStyle === "finder") &&
          isRecent(row.path) &&
          row.type === "file";
        const isActive =
          row.op?.op === "write" || row.op?.op === "create";
        return (
          <div
            key={row.path}
            className={`fnode ${isActive ? "is-active" : ""} ${
              writing && fsStyle === "shimmer" ? "is-writing" : ""
            } ${pulsing ? "is-pulsing" : ""}`}
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
      {fsStyle === "ticker" && (
        <>
          <div className="filetree__sect" style={{ marginTop: 16 }}>
            Recent ops
          </div>
          {fsOps
            .slice(-8)
            .reverse()
            .map((o) => (
              <div
                key={o.id}
                className="fnode"
                style={{ fontSize: 11 }}
              >
                <span
                  className={`fnode__badge fnode__badge--${
                    o.op === "read" ? "read" : o.op === "create" ? "add" : "mod"
                  }`}
                >
                  {o.op}
                </span>
                <span style={{ color: "var(--ag-text-secondary)" }}>
                  {o.path}
                </span>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
