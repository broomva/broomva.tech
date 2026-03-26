"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { GraphData, NodeType } from "@/lib/graph";

const KnowledgeGraph = dynamic(
  () =>
    import("@/components/graph/knowledge-graph").then((m) => ({
      default: m.KnowledgeGraph,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#09090b",
          color: "#71717a",
          fontSize: 14,
        }}
      >
        Loading graph…
      </div>
    ),
  },
);

const ALL_TYPES: NodeType[] = [
  "note",
  "project",
  "writing",
  "prompt",
  "skill",
  "tag",
  "memory",
  "conversation",
  "artifact",
];

const NODE_COLORS: Record<NodeType, string> = {
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

interface GraphViewProps {
  initialData: GraphData;
  userDataUrl: string;
}

export function GraphView({ initialData, userDataUrl }: GraphViewProps) {
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<NodeType[]>(ALL_TYPES);

  const toggleType = (type: NodeType) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          background: "#09090b",
          borderBottom: "1px solid #27272a",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes…"
          style={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            color: "#f4f4f5",
            fontSize: 13,
            outline: "none",
            padding: "4px 10px",
            width: 200,
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 11,
                background: activeTypes.includes(type)
                  ? NODE_COLORS[type]
                  : "#27272a",
                color: activeTypes.includes(type) ? "#09090b" : "#71717a",
                border: "none",
                cursor: "pointer",
                fontWeight: activeTypes.includes(type) ? 600 : 400,
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <KnowledgeGraph
          initialData={initialData}
          userDataUrl={userDataUrl}
          searchQuery={search || undefined}
          visibleTypes={
            activeTypes.length < ALL_TYPES.length ? activeTypes : undefined
          }
        />
      </div>
    </div>
  );
}
