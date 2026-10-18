"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import {
  BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import { Card } from "@/components/nora/card";
import { freqColor, perfColor } from "@/components/project/process-map-colors";
import { formatDuration } from "@/lib/format";
import { END_ID, START_ID, type Dfg, type DfgEdge, type DfgNode } from "@/lib/mock/eventlog";
import { NODE_SIZE } from "@/lib/mock/layout";
import { cx } from "@/utils/cx";

export type MapMode = "frekuensi" | "performa";
export type MapSelection = { kind: "node" | "edge"; id: string } | null;

type NodeData = { label: string; value: number | null; terminal: boolean; highlighted: boolean };
type EdgeData = { d: string; lx: number; ly: number; label: string | null; color: string; width: number };
type MapNode = Node<NodeData, "activity">;
type MapEdge = Edge<EdgeData, "flow">;

const isTerminal = (id: string) => id === START_ID || id === END_ID;

function ActivityNode({ data, selected }: NodeProps<MapNode>) {
  const { w, h } = data.terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
  return (
    <div style={{ width: w, height: h }} title={data.label}
      className={cx("flex flex-col items-center justify-center border bg-white px-2 text-center", data.terminal ? "rounded-full bg-sidebar" : "rounded-lg",
        selected ? "border-accent ring-2 ring-accent" : data.highlighted ? "border-status-suspended ring-2 ring-status-suspended" : "border-line shadow-card")}>
      <Handle type="target" position={Position.Left} isConnectable={false} className="!pointer-events-none !opacity-0" />
      <span className={cx("max-w-full truncate text-ink", data.terminal ? "text-[11px] font-medium" : "text-xs font-medium")}>{data.label}</span>
      {data.value !== null && <span className="text-xs text-ink-3">{data.value.toLocaleString("id-ID")} kasus</span>}
      <Handle type="source" position={Position.Right} isConnectable={false} className="!pointer-events-none !opacity-0" />
    </div>
  );
}

function FlowEdge({ markerEnd, selected, data }: EdgeProps<MapEdge>) {
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
const edgeTypes = { flow: FlowEdge };

/** Re-fit the viewport when the set of visible nodes changes; never moves nodes. */
function FitOnChange({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const raf = requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [fitKey, fitView]);
  return null;
}

type Pt = { x: number; y: number };
const centerOf = (positions: Record<string, Pt>, id: string): Pt => (Object.hasOwn(positions, id) ? positions[id] : { x: 0, y: 0 });

/** Point where the ray from a node's center toward `to` leaves the node (circle for terminals, rectangle otherwise). */
function boundary(c: Pt, terminal: boolean, to: Pt, gap: number): Pt {
  const dx = to.x - c.x, dy = to.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const { w, h } = terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
  const t = terminal ? w / 2 : Math.min(dx ? w / 2 / Math.abs(dx / len) : Infinity, dy ? h / 2 / Math.abs(dy / len) : Infinity);
  return { x: c.x + (dx / len) * (t + gap), y: c.y + (dy / len) * (t + gap) };
}

function edgeGeometry(e: DfgEdge, from: Pt, to: Pt, bend: number): Pick<EdgeData, "d" | "lx" | "ly"> {
  const fromT = isTerminal(e.from), toT = isTerminal(e.to);
  if (e.from === e.to) {
    const top = from.y - NODE_SIZE.activity.h / 2;
    return { d: `M ${from.x - 24} ${top} C ${from.x - 60} ${top - 56} ${from.x + 60} ${top - 56} ${from.x + 24} ${top - 2}`, lx: from.x, ly: top - 46 };
  }
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const cp = { x: (from.x + to.x) / 2 - (dy / len) * bend, y: (from.y + to.y) / 2 + (dx / len) * bend };
  const a = boundary(from, fromT, cp, 2), b = boundary(to, toT, cp, 4);
  return { d: `M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}`, lx: 0.25 * a.x + 0.5 * cp.x + 0.25 * b.x, ly: 0.25 * a.y + 0.5 * cp.y + 0.25 * b.y };
}

export function ProcessMap({ highlight, dfg, positions, visible, mode, selection, onSelect, hasStartTime }: {
  /** Activity labels (= node ids) to ring in the warning color; empty keeps the M05a look. */
  highlight?: Set<string>;
  dfg: Dfg;
  /** CENTER positions keyed by DFG node id (read with Object.hasOwn). */
  positions: Record<string, { x: number; y: number }>;
  visible: { nodes: DfgNode[]; edges: DfgEdge[] };
  mode: MapMode;
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  hasStartTime: boolean;
}) {
  // React Flow ids never come from data: nodes are n{index}, edges e{index} in the full DFG.
  const nodeIdx = useMemo(() => new Map(dfg.nodes.map((n, i) => [n.id, i])), [dfg]);
  const edgeIdx = useMemo(() => new Map(dfg.edges.map((e, i) => [e.id, i])), [dfg]);

  const { nodes, edges } = useMemo(() => {
    const nodes: MapNode[] = visible.nodes.map((n) => {
      const terminal = isTerminal(n.id);
      const { w, h } = terminal ? NODE_SIZE.terminal : NODE_SIZE.activity;
      const c = centerOf(positions, n.id);
      return {
        id: `n${nodeIdx.get(n.id)}`, type: "activity", position: { x: c.x - w / 2, y: c.y - h / 2 }, width: w, height: h,
        selected: selection?.kind === "node" && selection.id === n.id, draggable: false, connectable: false,
        ariaLabel: terminal ? n.label : `${n.label}, ${n.caseCount} kasus, ${n.eventCount} event`,
        data: { label: n.label, terminal, value: terminal ? null : n.caseCount, highlighted: !!highlight?.has(n.id) },
      };
    });
    const pairs = new Set(visible.edges.map((e) => `${nodeIdx.get(e.from)},${nodeIdx.get(e.to)}`));
    const inner = visible.edges.filter((e) => !isTerminal(e.from) && !isTerminal(e.to));
    const value = (e: DfgEdge) => (mode === "frekuensi" ? e.caseCount : e.medianMs);
    const pool = mode === "frekuensi" ? visible.edges : inner; // performance: start/end gaps are 0 and would skew the scale
    const lo = Math.min(...pool.map(value)), hi = Math.max(...pool.map(value));
    const edges: MapEdge[] = visible.edges.map((e) => {
      const terminalEdge = isTerminal(e.from) || isTerminal(e.to);
      const t = hi > lo ? Math.min(1, Math.max(0, (value(e) - lo) / (hi - lo))) : 0.5;
      const neutral = mode === "performa" && terminalEdge;
      const color = neutral ? "#b8bcc8" : mode === "frekuensi" ? freqColor(t) : perfColor(t);
      const width = neutral ? 1.5 : 1 + 7 * t;
      const bidirectional = e.from !== e.to && pairs.has(`${nodeIdx.get(e.to)},${nodeIdx.get(e.from)}`);
      const geo = edgeGeometry(e, centerOf(positions, e.from), centerOf(positions, e.to), bidirectional ? 28 : 0);
      const selected = selection?.kind === "edge" && selection.id === e.id;
      return {
        id: `e${edgeIdx.get(e.id)}`, type: "flow", source: `n${nodeIdx.get(e.from)}`, target: `n${nodeIdx.get(e.to)}`, selected, zIndex: selected ? 10 : 0,
        ariaLabel: `Transisi ${dfg.nodes[nodeIdx.get(e.from)!].label} ke ${dfg.nodes[nodeIdx.get(e.to)!].label}, ${e.caseCount} kasus, ${e.count} transisi`,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14, markerUnits: "userSpaceOnUse" },
        data: { ...geo, color, width, label: terminalEdge ? null : mode === "frekuensi" ? e.caseCount.toLocaleString("id-ID") : formatDuration(e.medianMs) },
      };
    });
    return { nodes, edges };
  }, [dfg, positions, visible, mode, selection, highlight, nodeIdx, edgeIdx]);

  const dfgNodeOf = useMemo(() => new Map(dfg.nodes.map((n, i) => [`n${i}`, n.id])), [dfg]);
  const dfgEdgeOf = useMemo(() => new Map(dfg.edges.map((e, i) => [`e${i}`, e.id])), [dfg]);
  const fitKey = useMemo(() => visible.nodes.map((n) => nodeIdx.get(n.id)).join(","), [visible.nodes, nodeIdx]);

  return (
    <Card className="overflow-hidden">
      <div className="h-[520px]" role="group" aria-label={hasStartTime ? "Peta proses" : "Peta proses (jeda antar-event selesai)"}>
        <ReactFlowProvider>
          <ReactFlow<MapNode, MapEdge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            nodesDraggable={false} nodesFocusable={false} edgesFocusable={false} nodesConnectable={false} elementsSelectable minZoom={0.1}
            onNodeClick={(_, n) => { const id = dfgNodeOf.get(n.id); if (id !== undefined) onSelect({ kind: "node", id }); }}
            onEdgeClick={(_, e) => { const id = dfgEdgeOf.get(e.id); if (id !== undefined) onSelect({ kind: "edge", id }); }}
            onPaneClick={() => onSelect(null)}
          />
          <FitOnChange fitKey={fitKey} />
        </ReactFlowProvider>
      </div>
    </Card>
  );
}
