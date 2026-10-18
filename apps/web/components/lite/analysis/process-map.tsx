"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import {
  BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { formatSeconds } from "@/lib/lite/format";
import { cx } from "@/utils/cx";
import { freqColor, isTerminal, NODE_SIZE, perfColor, type MapEdge, type MapNode } from "./map-model";

export type MapMode = "frequency" | "performance";
export type MapSelection = { kind: "node" | "edge"; id: string } | null;

type NodeData = { label: string; value: number | null; events: number | null; terminal: boolean; boundary: boolean };
type EdgeData = { d: string; lx: number; ly: number; label: string | null; color: string; width: number };
type FlowNode = Node<NodeData, "activity">;
type FlowEdge = Edge<EdgeData, "flow">;

function ActivityNode({ data, selected }: NodeProps<FlowNode>) {
  const { w, h } = data.terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
  return (
    <div style={{ width: w, height: h }} title={data.label}
      className={cx("flex flex-col items-center justify-center border bg-white px-2 text-center", data.terminal ? "rounded-full bg-sidebar" : "rounded-lg",
        selected ? "border-accent ring-2 ring-accent" : data.boundary ? "border-accent/60 shadow-card" : "border-line shadow-card")}>
      <Handle type="target" position={Position.Left} isConnectable={false} className="!pointer-events-none !opacity-0" />
      <span className={cx("max-w-full truncate text-ink", data.terminal ? "text-[11px] font-medium" : "text-xs font-medium")}>{data.label}</span>
      {data.value !== null && <span className="text-xs text-ink-3">{data.value.toLocaleString("id-ID")} kasus · {data.events?.toLocaleString("id-ID")} event</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} className="!pointer-events-none !opacity-0" />
    </div>
  );
}

function FlowEdgeView({ markerEnd, selected, data }: EdgeProps<FlowEdge>) {
  if (!data) return null;
  return (
    <>
      {selected && <path d={data.d} fill="none" stroke="#2f399f" strokeOpacity={0.25} strokeWidth={data.width + 8} />}
      <BaseEdge path={data.d} markerEnd={markerEnd} interactionWidth={16} style={{ stroke: data.color, strokeWidth: data.width }} />
      {data.label && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-50%) translate(${data.lx}px,${data.ly}px)` }}
            className={cx("pointer-events-none absolute rounded border bg-white px-1 text-[11px] leading-4 text-ink-2", selected ? "border-accent font-medium text-ink" : "border-line")}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { activity: ActivityNode };
const edgeTypes = { flow: FlowEdgeView };

function FitOnChange({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const raf = requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [fitKey, fitView]);
  return null;
}

type Pt = { x: number; y: number };
const at = (p: Record<string, Pt>, id: string): Pt => (Object.hasOwn(p, id) ? p[id]! : { x: 0, y: 0 });

function boundary(c: Pt, terminal: boolean, to: Pt, gap: number): Pt {
  const dx = to.x - c.x, dy = to.y - c.y, len = Math.hypot(dx, dy) || 1;
  const { w, h } = terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
  const t = terminal ? w / 2 : Math.min(dx ? w / 2 / Math.abs(dx / len) : Infinity, dy ? h / 2 / Math.abs(dy / len) : Infinity);
  return { x: c.x + (dx / len) * (t + gap), y: c.y + (dy / len) * (t + gap) };
}

/** Self-loops draw above the node; bidirectional pairs bend apart so both directions stay visible. */
function geometry(e: MapEdge, from: Pt, to: Pt, bend: number) {
  if (e.from === e.to) {
    const top = from.y - NODE_SIZE.activity.h / 2;
    return { d: `M ${from.x - 24} ${top} C ${from.x - 60} ${top - 56} ${from.x + 60} ${top - 56} ${from.x + 24} ${top - 2}`, lx: from.x, ly: top - 46 };
  }
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const cp = { x: (from.x + to.x) / 2 - (dy / len) * bend, y: (from.y + to.y) / 2 + (dx / len) * bend };
  const a = boundary(from, isTerminal(e.from), cp, 2), b = boundary(to, isTerminal(e.to), cp, 4);
  return { d: `M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}`, lx: 0.25 * a.x + 0.5 * cp.x + 0.25 * b.x, ly: 0.25 * a.y + 0.5 * cp.y + 0.25 * b.y };
}

export function ProcessMap({ allNodes, allEdges, positions, nodes: visNodes, edges: visEdges, mode, selection, onSelect }: {
  allNodes: MapNode[]; allEdges: MapEdge[]; positions: Record<string, Pt>; nodes: MapNode[]; edges: MapEdge[];
  mode: MapMode; selection: MapSelection; onSelect: (s: MapSelection) => void;
}) {
  // React Flow ids never come from data: n{i}/e{i} index into the full graph.
  const nodeIdx = useMemo(() => new Map(allNodes.map((n, i) => [n.id, i])), [allNodes]);
  const edgeIdx = useMemo(() => new Map(allEdges.map((e, i) => [e.id, i])), [allEdges]);
  const { nodes, edges } = useMemo(() => {
    const nodes: FlowNode[] = visNodes.map((n) => {
      const terminal = isTerminal(n.id);
      const { w, h } = terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
      const c = at(positions, n.id);
      return {
        id: `n${nodeIdx.get(n.id)}`, type: "activity", position: { x: c.x - w / 2, y: c.y - h / 2 }, width: w, height: h,
        selected: selection?.kind === "node" && selection.id === n.id, draggable: false, connectable: false,
        ariaLabel: terminal ? n.label : `${n.label}, ${n.caseCount} kasus, ${n.eventCount} event`,
        data: { label: n.label, terminal, value: terminal ? null : n.caseCount, events: terminal ? null : n.eventCount, boundary: n.boundaryStart || n.boundaryEnd },
      };
    });
    const pairs = new Set(visEdges.map((e) => `${e.from}\u0000${e.to}`));
    const value = (e: MapEdge) => (mode === "frequency" ? e.caseCount : e.medianSeconds);
    const pool = mode === "frequency" ? visEdges : visEdges.filter((e) => !isTerminal(e.from) && !isTerminal(e.to));
    const vals = pool.map(value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const edges: FlowEdge[] = visEdges.map((e) => {
      const terminalEdge = isTerminal(e.from) || isTerminal(e.to);
      const t = hi > lo ? Math.min(1, Math.max(0, (value(e) - lo) / (hi - lo))) : 0.5;
      const neutral = mode === "performance" && terminalEdge;
      const color = neutral ? "#b8bcc8" : mode === "frequency" ? freqColor(t) : perfColor(t);
      const width = neutral ? 1.5 : 1 + 7 * t;
      const bidirectional = e.from !== e.to && pairs.has(`${e.to}\u0000${e.from}`);
      const selected = selection?.kind === "edge" && selection.id === e.id;
      return {
        id: `e${edgeIdx.get(e.id)}`, type: "flow", source: `n${nodeIdx.get(e.from)}`, target: `n${nodeIdx.get(e.to)}`, selected, zIndex: selected ? 10 : 0,
        ariaLabel: `Transisi ${e.from} ke ${e.to}, ${e.caseCount} kasus`,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14, markerUnits: "userSpaceOnUse" },
        data: { ...geometry(e, at(positions, e.from), at(positions, e.to), bidirectional ? 28 : 0), color, width,
          label: terminalEdge ? null : mode === "frequency" ? e.caseCount.toLocaleString("id-ID") : formatSeconds(e.medianSeconds) },
      };
    });
    return { nodes, edges };
  }, [visNodes, visEdges, positions, mode, selection, nodeIdx, edgeIdx]);

  const nodeOf = useMemo(() => new Map(allNodes.map((n, i) => [`n${i}`, n.id])), [allNodes]);
  const edgeOf = useMemo(() => new Map(allEdges.map((e, i) => [`e${i}`, e.id])), [allEdges]);
  const fitKey = useMemo(() => visNodes.map((n) => nodeIdx.get(n.id)).join(","), [visNodes, nodeIdx]);

  return (
    <div className="h-[520px]" role="group" aria-label="Peta proses">
      <ReactFlowProvider>
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesFocusable={false} edgesFocusable={false} nodesConnectable={false} elementsSelectable minZoom={0.1}
          onNodeClick={(_, n) => { const id = nodeOf.get(n.id); if (id !== undefined && !isTerminal(id)) onSelect({ kind: "node", id }); }}
          onEdgeClick={(_, e) => { const id = edgeOf.get(e.id); if (id !== undefined) onSelect({ kind: "edge", id }); }}
          onPaneClick={() => onSelect(null)}
        />
        <FitOnChange fitKey={fitKey} />
      </ReactFlowProvider>
    </div>
  );
}
