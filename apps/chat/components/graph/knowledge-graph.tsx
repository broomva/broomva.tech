"use client";

import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

import type { GraphData, GraphNode, NodeType } from "@/lib/graph";

// NodeObject is not re-exported by react-force-graph, derive it from the component's onNodeClick prop
type ForceGraph2DProps = ComponentProps<typeof ForceGraph2D>;
type NodeObject = NonNullable<Parameters<NonNullable<ForceGraph2DProps["onNodeClick"]>>[0]>;

const NODE_COLORS: Record<string, string> = {
  note: "#3b82f6",
  project: "#a855f7",
  writing: "#eab308",
  prompt: "#f97316",
  skill: "#22c55e",
  tag: "#71717a",
  memory: "#ef4444",
  conversation: "#8b5cf6",
  artifact: "#f8fafc",
};

const DIM_COLOR = "#27272a";
const FALLBACK_COLOR = "#6b7280";

interface KnowledgeGraphProps {
  initialData: GraphData;
  userDataUrl?: string;
  searchQuery?: string;
  visibleTypes?: NodeType[];
}

const S = {
  panel: { position: "absolute" as const, right: 0, top: 0, width: 320, height: "100%", background: "#18181b", borderLeft: "1px solid #27272a", padding: 24, overflowY: "auto" as const, zIndex: 10 },
  close: { background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 },
  badge: (color: string) => ({ display: "inline-block" as const, background: color, color: "#09090b", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" }),
  title: { color: "#f4f4f5", fontSize: 18, fontWeight: 600, marginTop: 10, marginBottom: 8, lineHeight: 1.4 },
  tags: { display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 16 },
  tag: { color: "#a1a1aa", fontSize: 12, background: "#27272a", padding: "2px 6px", borderRadius: 4 },
  link: { display: "inline-block", color: "#60a5fa", fontSize: 14, textDecoration: "none", marginTop: 4 },
};

function NodePanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div style={S.panel}>
      <button type="button" onClick={onClose} style={S.close}>✕</button>
      <div style={{ marginTop: 16 }}>
        <span style={S.badge(NODE_COLORS[node.type] ?? FALLBACK_COLOR)}>{node.type}</span>
        <h2 style={S.title}>{node.label}</h2>
        {node.tags && node.tags.length > 0 ? (
          <div style={S.tags}>
            {node.tags.map((tag) => <span key={tag} style={S.tag}>#{tag}</span>)}
          </div>
        ) : null}
        {node.url ? <a href={node.url} style={S.link}>View page →</a> : null}
      </div>
    </div>
  );
}

export function KnowledgeGraph({
  initialData,
  userDataUrl,
  searchQuery,
  visibleTypes,
}: KnowledgeGraphProps) {
  const [graphData, setGraphData] = useState<GraphData>(initialData);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Fetch user data overlay on mount
  useEffect(() => {
    if (!userDataUrl) return;
    fetch(userDataUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GraphData | null) => {
        if (!data) return;
        setGraphData((prev) => ({
          nodes: [...prev.nodes, ...data.nodes],
          links: [...prev.links, ...data.links],
        }));
      })
      .catch(() => {});
  }, [userDataUrl]);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Filter visible nodes/links based on visibleTypes prop
  const filteredData = useMemo(() => {
    if (!visibleTypes || visibleTypes.length === 0) return graphData;
    const typeSet = new Set<string>(visibleTypes);
    const visibleNodes = graphData.nodes.filter((n) => typeSet.has(n.type));
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = graphData.links.filter((l) => {
      const src = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      return visibleIds.has(src) && visibleIds.has(tgt);
    });
    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, visibleTypes]);

  const nodeColor = useCallback(
    (node: NodeObject) => {
      const gNode = node as unknown as GraphNode;
      if (
        searchQuery &&
        !gNode.label.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return DIM_COLOR;
      }
      return NODE_COLORS[gNode.type] ?? FALLBACK_COLOR;
    },
    [searchQuery],
  );

  const nodeVal = useCallback(
    (node: NodeObject) => {
      const gNode = node as unknown as GraphNode;
      if (
        searchQuery &&
        gNode.label.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return (gNode.val ?? 1) * 2;
      }
      return gNode.val ?? 1;
    },
    [searchQuery],
  );

  const handleNodeClick = useCallback((node: NodeObject) => {
    setSelectedNode(node as unknown as GraphNode);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", background: "#09090b" }}
    >
      <ForceGraph2D
        graphData={filteredData as Parameters<typeof ForceGraph2D>[0]["graphData"]}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#09090b"
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        nodeLabel="label"
        onNodeClick={handleNodeClick}
        linkColor={() => "#3f3f46"}
        linkWidth={0.5}
      />
      {selectedNode ? (
        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      ) : null}
    </div>
  );
}
