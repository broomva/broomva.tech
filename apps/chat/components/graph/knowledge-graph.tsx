"use client";

/**
 * KnowledgeGraph — BRO-233
 *
 * Force-directed canvas graph using react-force-graph.
 * Renders the public content graph and optionally merges the per-user
 * Lago overlay when the user is authenticated.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphData, GraphNode, NodeType } from "@/lib/graph/types";

// ForceGraph2D uses canvas APIs — must be loaded client-side only
const ForceGraph2D = dynamic(
  () => import("react-force-graph").then((m) => m.ForceGraph2D),
  { ssr: false },
);

// ─── Node colour palette ────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  note: "#60a5fa", // blue-400
  project: "#a78bfa", // violet-400
  writing: "#facc15", // yellow-400
  prompt: "#fb923c", // orange-400
  skill: "#4ade80", // green-400
  tag: "#71717a", // zinc-500
  memory: "#f87171", // red-400
  conversation: "#c084fc", // purple-400
  artifact: "#e4e4e7", // zinc-200
};

const NODE_LABELS: Record<NodeType, string> = {
  note: "Note",
  project: "Project",
  writing: "Writing",
  prompt: "Prompt",
  skill: "Skill",
  tag: "Tag",
  memory: "Memory",
  conversation: "Conversation",
  artifact: "Artifact",
};

const PUBLIC_TYPES: NodeType[] = [
  "note",
  "project",
  "writing",
  "prompt",
  "skill",
  "tag",
];
const USER_TYPES: NodeType[] = ["memory", "conversation", "artifact"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeGraphs(base: GraphData, overlay: GraphData): GraphData {
  const existingIds = new Set(base.nodes.map((n) => n.id));
  const newNodes = overlay.nodes.filter((n) => !existingIds.has(n.id));
  const existingLinks = new Set(
    base.links.map((l) => `${l.source}|${l.target}`),
  );
  const newLinks = overlay.links.filter(
    (l) => !existingLinks.has(`${l.source}|${l.target}`),
  );
  return {
    nodes: [...base.nodes, ...newNodes],
    links: [...base.links, ...newLinks],
  };
}

// ─── Side panel ──────────────────────────────────────────────────────────────

function NodePanel({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-[var(--ag-border-default)] bg-bg-surface p-5 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: NODE_COLORS[node.type] + "33",
            color: NODE_COLORS[node.type],
          }}
        >
          {NODE_LABELS[node.type]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <h2 className="mt-3 text-base font-semibold text-text-primary leading-snug">
        {node.label}
      </h2>

      {node.summary && (
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          {node.summary}
        </p>
      )}

      {node.tags && node.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--ag-border-default)] px-2 py-0.5 text-xs text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {node.url && (
        <a
          href={node.url}
          target={node.url.startsWith("http") ? "_blank" : undefined}
          rel={node.url.startsWith("http") ? "noopener noreferrer" : undefined}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-ai-blue hover:underline"
        >
          Open →
        </a>
      )}
    </div>
  );
}

// ─── Filter chips ────────────────────────────────────────────────────────────

function FilterChips({
  active,
  hasUserLayer,
  onChange,
}: {
  active: Set<NodeType>;
  hasUserLayer: boolean;
  onChange: (types: Set<NodeType>) => void;
}) {
  const allTypes = hasUserLayer
    ? [...PUBLIC_TYPES, ...USER_TYPES]
    : PUBLIC_TYPES;

  const toggle = (type: NodeType) => {
    const next = new Set(active);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {allTypes.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => toggle(type)}
          className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
          style={{
            borderColor: active.has(type)
              ? NODE_COLORS[type]
              : "var(--ag-border-default)",
            color: active.has(type) ? NODE_COLORS[type] : "var(--text-muted)",
            backgroundColor: active.has(type)
              ? NODE_COLORS[type] + "1a"
              : "transparent",
          }}
        >
          {NODE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface KnowledgeGraphProps {
  initialData: GraphData;
  /** If provided, fetched client-side to add the authenticated user layer */
  userDataUrl?: string;
}

export function KnowledgeGraph({
  initialData,
  userDataUrl,
}: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [graphData, setGraphData] = useState<GraphData>(initialData);
  const [hasUserLayer, setHasUserLayer] = useState(false);
  const [userLayerLoading, setUserLayerLoading] = useState(false);
  const [showUserLayer, setShowUserLayer] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    new Set([...PUBLIC_TYPES]),
  );

  // Measure container dimensions
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch user graph overlay
  useEffect(() => {
    if (!userDataUrl || hasUserLayer) return;
    setUserLayerLoading(true);
    fetch(userDataUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GraphData | null) => {
        if (data && (data.nodes.length > 0 || data.links.length > 0)) {
          setGraphData((prev) => mergeGraphs(prev, data));
          setHasUserLayer(true);
          setActiveTypes((prev) => new Set([...prev, ...USER_TYPES]));
          setShowUserLayer(true);
        }
      })
      .catch(() => null)
      .finally(() => setUserLayerLoading(false));
  }, [userDataUrl, hasUserLayer]);

  // Derived: filtered nodes based on active types + search
  const filteredData = useCallback((): GraphData => {
    const lq = search.toLowerCase();
    const visibleNodes = graphData.nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false;
      if (lq && !n.label.toLowerCase().includes(lq)) return false;
      if (!showUserLayer && USER_TYPES.includes(n.type as NodeType))
        return false;
      return true;
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = graphData.links.filter(
      (l) =>
        visibleIds.has(l.source as string) &&
        visibleIds.has(l.target as string),
    );
    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, activeTypes, search, showUserLayer]);

  const nodeColor = useCallback(
    (node: GraphNode) => {
      if (search && !node.label.toLowerCase().includes(search.toLowerCase())) {
        return NODE_COLORS[node.type] + "30"; // dim non-matching
      }
      return NODE_COLORS[node.type];
    },
    [search],
  );

  const nodeLabel = useCallback((node: GraphNode) => node.label, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ag-border-default)] px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes…"
          className="h-8 w-48 rounded-lg border border-[var(--ag-border-default)] bg-bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-ai-blue focus:outline-none"
        />

        <FilterChips
          active={activeTypes}
          hasUserLayer={hasUserLayer}
          onChange={setActiveTypes}
        />

        {userDataUrl && (
          <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
            {userLayerLoading ? (
              <span className="animate-pulse">Loading your knowledge…</span>
            ) : hasUserLayer ? (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showUserLayer}
                  onChange={(e) => setShowUserLayer(e.target.checked)}
                  className="accent-ai-blue"
                />
                My knowledge
              </label>
            ) : null}
          </div>
        )}
      </div>

      {/* Canvas + side panel */}
      <div className="relative flex-1 overflow-hidden" ref={containerRef}>
        <ForceGraph2D
          graphData={filteredData()}
          width={dimensions.width - (selectedNode ? 288 : 0)}
          height={dimensions.height}
          backgroundColor="#0a0a0f"
          nodeColor={nodeColor as (node: object) => string}
          nodeLabel={nodeLabel as (node: object) => string}
          nodeRelSize={4}
          nodeVal={(node) => (node as GraphNode).val}
          linkColor={() => "#27272a"}
          linkWidth={1}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.003}
          onNodeClick={handleNodeClick as (node: object) => void}
          cooldownTicks={150}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />

        {selectedNode && (
          <NodePanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Node count footer */}
      <div className="border-t border-[var(--ag-border-default)] px-4 py-1.5 text-xs text-text-muted">
        {filteredData().nodes.length} nodes · {filteredData().links.length}{" "}
        edges
      </div>
    </div>
  );
}
