"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { RELATION_META, layoutLevels, type LineageResult } from "@/lib/mock/graph";
import type { RelationCategory } from "@/lib/mock/types";

const STROKE: Record<string, string> = { accent: "var(--color-accent)", ink: "var(--color-ink)", warning: "var(--color-status-suspended)", neutral: "var(--color-ink-3)" };

export default function GraphCanvas({ result, filter, selectedId, onSelect }: { result: LineageResult; filter: ReadonlySet<RelationCategory>; selectedId: string | null; onSelect: (id: string) => void }) {
  const nodes = useMemo<Node[]>(() => {
    const pos = layoutLevels(result.levels);
    return result.nodes.map((n) => ({
      id: n.id, position: pos[n.id], data: { label: n.label }, selected: n.id === selectedId,
      style: { width: 220, fontSize: 12, border: n.id === selectedId ? "2px solid var(--color-accent)" : "1px solid var(--color-line)" },
    }));
  }, [result, selectedId]);
  const edges = useMemo<Edge[]>(() => result.edges.map((e) => ({
    id: e.id, source: e.from, target: e.to, label: e.type, hidden: !filter.has(e.category),
    style: { stroke: STROKE[RELATION_META[e.category].tone] }, labelStyle: { fontSize: 10 },
  })), [result, filter]);
  return (
    <div className="h-[520px] rounded-lg border border-line bg-white">
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, n) => onSelect(n.id)}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
