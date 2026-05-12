"use client";

/**
 * KnowledgeGraph — BRO-233
 *
 * Force-directed canvas graph using react-force-graph.
 * Renders the public content graph and optionally merges the per-user
 * Lago overlay when the user is authenticated.
 *
 * Features:
 *  - Custom node rendering with glow halos
 *  - Colored directional particles on links (microanimations)
 *  - Node hover highlights with neighbor emphasis
 *  - Type-filtered search with side panel detail view
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphData,
  GraphLink,
  GraphNode,
  LinkType,
  NodeType,
} from "@/lib/graph/types";

// ForceGraph2D uses canvas APIs — must be loaded client-side only
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => ({ default: m.default })),
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

const LINK_COLORS: Record<LinkType, string> = {
  wikilink: "#60a5fa40", // blue, muted
  tag: "#71717a30", // zinc, very subtle
  reference: "#a78bfa50", // violet
  conversation: "#c084fc40", // purple
};

const LINK_PARTICLE_COLORS: Record<LinkType, string> = {
  wikilink: "#60a5fa",
  tag: "#71717a",
  reference: "#a78bfa",
  conversation: "#c084fc",
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

/** Build a set of neighbor node IDs for a given node */
function getNeighborIds(
  nodeId: string,
  links: GraphLink[],
): Set<string> {
  const neighbors = new Set<string>();
  for (const link of links) {
    const s = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
    const t = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
    if (s === nodeId) neighbors.add(t);
    if (t === nodeId) neighbors.add(s);
  }
  return neighbors;
}

// ─── Hex color helpers ──────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
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
    <div className="absolute right-0 top-0 h-full w-72 overflow-y-auto border-l border-[var(--ag-border-default)] bg-bg-surface/95 p-5 shadow-xl backdrop-blur-sm">
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
          className="text-text-muted hover:text-text-primary transition-colors"
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
          className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200"
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
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<NodeType>>(
    new Set([...PUBLIC_TYPES]),
  );

  // Neighbors of hovered node — for highlighting
  const hoverNeighbors = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    return getNeighborIds(hoveredNode.id, graphData.links);
  }, [hoveredNode, graphData.links]);

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
  const filteredData = useMemo((): GraphData => {
    const lq = search.toLowerCase();
    const visibleNodes = graphData.nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false;
      if (lq && !n.label.toLowerCase().includes(lq)) return false;
      if (!showUserLayer && USER_TYPES.includes(n.type as NodeType))
        return false;
      return true;
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = graphData.links.filter((l) => {
      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });
    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, activeTypes, search, showUserLayer]);

  // Custom node canvas renderer with glow effect
  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };
      const color = NODE_COLORS[n.type];
      const radius = Math.sqrt(Math.max(n.val, 1)) * 3 + 1.5;

      const isHovered = hoveredNode?.id === n.id;
      const isNeighbor = hoveredNode && hoverNeighbors.has(n.id);
      const isDimmed = hoveredNode && !isHovered && !isNeighbor;
      const isSearchDimmed =
        search && !n.label.toLowerCase().includes(search.toLowerCase());

      const alpha = isDimmed || isSearchDimmed ? 0.15 : 1;
      const [r, g, b] = hexToRgb(color);

      // Glow halo for hovered and neighbor nodes
      if (isHovered || isNeighbor) {
        const glowRadius = radius + (isHovered ? 12 : 6);
        const gradient = ctx.createRadialGradient(
          n.x,
          n.y,
          radius,
          n.x,
          n.y,
          glowRadius,
        );
        gradient.addColorStop(0, `rgba(${r},${g},${b},${isHovered ? 0.4 : 0.2})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();

      // Label text — show on hover or when zoomed in enough
      if ((isHovered || globalScale > 2.5) && !isDimmed) {
        const fontSize = Math.max(10 / globalScale, 2.5);
        ctx.font = `${fontSize}px "Geist", -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = `rgba(244,244,245,${alpha * 0.9})`;
        ctx.fillText(n.label, n.x, n.y + radius + 2);
      }
    },
    [hoveredNode, hoverNeighbors, search],
  );

  // Link styling
  const linkColor = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      if (!hoveredNode) return LINK_COLORS[l.type] ?? "#27272a30";

      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      const isConnected = s === hoveredNode.id || t === hoveredNode.id;
      if (isConnected) return LINK_PARTICLE_COLORS[l.type] ?? "#60a5fa";
      return "#27272a15";
    },
    [hoveredNode],
  );

  const linkWidth = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      if (!hoveredNode) return l.type === "tag" ? 0.3 : 0.8;

      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      const isConnected = s === hoveredNode.id || t === hoveredNode.id;
      return isConnected ? 1.5 : 0.2;
    },
    [hoveredNode],
  );

  const linkParticleColor = useCallback((link: object) => {
    const l = link as GraphLink;
    return LINK_PARTICLE_COLORS[l.type] ?? "#60a5fa";
  }, []);

  const nodeLabel = useCallback((node: object) => (node as GraphNode).label, []);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode;
    setSelectedNode((prev) => (prev?.id === n.id ? null : n));
  }, []);

  const handleNodeHover = useCallback((node: object | null) => {
    setHoveredNode(node ? (node as GraphNode) : null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Controls bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--ag-border-default)] px-4 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes…"
          className="h-8 w-48 rounded-lg border border-[var(--ag-border-default)] bg-bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-ai-blue focus:outline-none transition-colors"
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
      <div className="relative min-h-0 flex-1 overflow-hidden" ref={containerRef}>
        <ForceGraph2D
          graphData={filteredData}
          width={dimensions.width - (selectedNode ? 288 : 0)}
          height={dimensions.height}
          backgroundColor="#0a0a0f"
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as GraphNode & { x: number; y: number };
            const radius = Math.sqrt(Math.max(n.val, 1)) * 3 + 4;
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          nodeLabel={nodeLabel}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleColor={linkParticleColor}
          linkCurvature={0.1}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          cooldownTicks={200}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          warmupTicks={50}
        />

        {selectedNode && (
          <NodePanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-4 border-t border-[var(--ag-border-default)] px-4 py-1.5 text-xs text-text-muted">
        <span>
          {filteredData.nodes.length} nodes · {filteredData.links.length} edges
        </span>
        {hoveredNode && (
          <span className="truncate" style={{ color: NODE_COLORS[hoveredNode.type] }}>
            {hoveredNode.label}
          </span>
        )}
      </div>
    </div>
  );
}
