"use client";

import {
  ArrowLeft,
  Clock,
  Download,
  File,
  FileText,
  Folder,
  GitBranch,
  Loader2,
  Tag,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { LagoManifestEntry, LagoSession, LagoSnapshot } from "@/lib/lago/types";
import { classifySessionTier, TIER_COLORS } from "@/lib/lago/types";

const LAGO_BASE =
  process.env.NEXT_PUBLIC_LAGO_URL ?? "https://api.lago.arcan.la";

type Tab = "files" | "snapshots" | "branches";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<LagoSession | null>(null);
  const [manifest, setManifest] = useState<LagoManifestEntry[]>([]);
  const [snapshots, setSnapshots] = useState<LagoSnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sessionRes, manifestRes, snapshotsRes] =
        await Promise.allSettled([
          fetch(`${LAGO_BASE}/v1/sessions/${id}`),
          fetch(`${LAGO_BASE}/v1/sessions/${id}/manifest`),
          fetch(`${LAGO_BASE}/v1/sessions/${id}/snapshots`),
        ]);

      if (sessionRes.status === "fulfilled" && sessionRes.value.ok)
        setSession(await sessionRes.value.json());
      if (manifestRes.status === "fulfilled" && manifestRes.value.ok) {
        const data = await manifestRes.value.json();
        setManifest(data.entries ?? []);
      }
      if (snapshotsRes.status === "fulfilled" && snapshotsRes.value.ok)
        setSnapshots(await snapshotsRes.value.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadFile = async (path: string) => {
    setSelectedFile(path);
    setFileContent(null);
    try {
      const res = await fetch(
        `${LAGO_BASE}/v1/sessions/${id}/files${path}`
      );
      if (res.ok) setFileContent(await res.text());
    } catch {
      setFileContent("(failed to load)");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="glass-card mx-auto max-w-2xl text-center text-text-secondary">
        Session not found: {id}
      </div>
    );
  }

  const tier = classifySessionTier(session.name);

  // Build directory tree from manifest
  const tree = buildTree(manifest);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={"/console/lago/sessions" as Route}
          className="text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-semibold">
              {session.name}
            </h1>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TIER_COLORS[tier]}`}
            >
              {tier}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {session.session_id}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--ag-border-default)]">
        {(
          [
            ["files", FileText, `Files (${manifest.length})`],
            ["snapshots", Tag, `Snapshots (${snapshots.length})`],
            ["branches", GitBranch, `Branches (${session.branches.length})`],
          ] as const
        ).map(([tab, Icon, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-ai-blue text-ai-blue"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "files" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* File tree */}
          <div className="glass-card lg:col-span-1 max-h-[600px] overflow-y-auto">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Manifest
            </h3>
            <FileTree
              node={tree}
              onSelect={loadFile}
              selected={selectedFile}
            />
          </div>

          {/* File preview */}
          <div className="glass-card lg:col-span-2 min-h-[400px]">
            {selectedFile ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-sm text-text-primary">
                    {selectedFile}
                  </span>
                  <a
                    href={`${LAGO_BASE}/v1/sessions/${id}/files${selectedFile}`}
                    className="glass-button text-xs"
                    target="_blank"
                    rel="noopener"
                  >
                    <Download className="size-3" />
                    Raw
                  </a>
                </div>
                {fileContent === null ? (
                  <Loader2 className="size-5 animate-spin text-text-muted" />
                ) : (
                  <pre className="overflow-x-auto rounded-lg bg-bg-default p-3 text-xs text-text-primary font-mono leading-relaxed max-h-[500px] overflow-y-auto">
                    {fileContent}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Select a file to preview
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "snapshots" && (
        <div className="space-y-2">
          {snapshots.length === 0 ? (
            <div className="glass-card text-center text-text-secondary">
              No snapshots yet.
            </div>
          ) : (
            snapshots.map((snap) => (
              <div key={snap.name} className="glass-card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-ai-blue" />
                  <span className="font-mono text-sm text-text-primary">
                    {snap.name}
                  </span>
                  <span className="glass-badge">seq {snap.seq}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="size-3" />
                  {new Date(snap.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "branches" && (
        <div className="space-y-2">
          {session.branches.map((branch) => (
            <div key={branch} className="glass-card flex items-center gap-2">
              <GitBranch className="size-4 text-emerald-400" />
              <span className="font-mono text-sm text-text-primary">
                {branch}
              </span>
              {branch === "main" && (
                <span className="glass-badge">default</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File Tree Component ─────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  entry?: LagoManifestEntry;
}

function buildTree(entries: LagoManifestEntry[]): TreeNode {
  const root: TreeNode = { name: "/", path: "/", children: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: `/${parts.slice(0, i + 1).join("/")}`,
          children: [],
        };
        node.children.push(child);
      }
      if (i === parts.length - 1) {
        child.entry = entry;
      }
      node = child;
    }
  }
  return root;
}

function FileTree({
  node,
  onSelect,
  selected,
  depth = 0,
}: {
  node: TreeNode;
  onSelect: (path: string) => void;
  selected: string | null;
  depth?: number;
}) {
  const isDir = node.children.length > 0 && !node.entry;

  if (depth === 0) {
    return (
      <div className="space-y-0.5">
        {node.children
          .sort((a, b) => {
            const aDir = a.children.length > 0 && !a.entry;
            const bDir = b.children.length > 0 && !b.entry;
            if (aDir !== bDir) return aDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((child) => (
            <FileTree
              key={child.path}
              node={child}
              onSelect={onSelect}
              selected={selected}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => !isDir && node.entry && onSelect(node.path)}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
          selected === node.path
            ? "bg-ai-blue/20 text-ai-blue"
            : isDir
              ? "text-text-primary cursor-default"
              : "text-text-secondary hover:bg-bg-default/80 hover:text-text-primary cursor-pointer"
        }`}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {isDir ? (
          <Folder className="size-3.5 text-text-muted" />
        ) : (
          <File className="size-3.5 text-text-muted" />
        )}
        <span className="truncate">{node.name}</span>
        {node.entry && (
          <span className="ml-auto text-[10px] text-text-muted">
            {formatSize(node.entry.size_bytes)}
          </span>
        )}
      </button>
      {isDir &&
        node.children
          .sort((a, b) => {
            const aDir = a.children.length > 0 && !a.entry;
            const bDir = b.children.length > 0 && !b.entry;
            if (aDir !== bDir) return aDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((child) => (
            <FileTree
              key={child.path}
              node={child}
              onSelect={onSelect}
              selected={selected}
              depth={depth + 1}
            />
          ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
