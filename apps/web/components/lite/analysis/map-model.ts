import dagre from "@dagrejs/dagre";
import type { ProcessMapResult } from "@nora/contracts";

export type MapNode = ProcessMapResult["nodes"][number];
export type MapEdge = ProcessMapResult["edges"][number];

export const START_ID = "__start";
export const END_ID = "__end";
export const isTerminal = (id: string) => id === START_ID || id === END_ID;
export const NODE_SIZE = { activity: { w: 180, h: 56 }, terminal: { w: 56, h: 56 } };

/** Center positions from the FULL graph, so simplifying the view never moves a node. */
export function layoutMap(nodes: MapNode[], edges: MapEdge[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  const safe = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
  for (const n of nodes) {
    const s = isTerminal(n.id) ? NODE_SIZE.terminal : NODE_SIZE.activity;
    g.setNode(safe.get(n.id)!, { width: s.w, height: s.h });
  }
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to || !safe.has(e.from) || !safe.has(e.to)) continue;
    const key = [safe.get(e.from)!, safe.get(e.to)!].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(safe.get(e.from)!, safe.get(e.to)!);
  }
  dagre.layout(g);
  return Object.fromEntries([...safe].map(([id, name]) => [id, { x: Math.round(g.node(name).x), y: Math.round(g.node(name).y) }]));
}

/**
 * Display-only simplification: keep the most frequent activities covering `activityPct` of events, then the most
 * frequent transitions among them covering `transitionPct` of transitions. Analysis results are untouched.
 */
export function simplify(nodes: MapNode[], edges: MapEdge[], activityPct: number, transitionPct: number) {
  const acts = nodes.filter((n) => !isTerminal(n.id)).sort((a, b) => b.eventCount - a.eventCount || a.id.localeCompare(b.id));
  const totalEvents = acts.reduce((s, n) => s + n.eventCount, 0);
  const keep = new Set<string>([START_ID, END_ID]);
  let acc = 0;
  for (const n of acts) {
    if (keep.size > 2 && acc / totalEvents >= activityPct / 100) break;
    keep.add(n.id);
    acc += n.eventCount;
  }
  const candidates = edges.filter((e) => keep.has(e.from) && keep.has(e.to)).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const inner = candidates.filter((e) => !isTerminal(e.from) && !isTerminal(e.to));
  const totalInner = inner.reduce((s, e) => s + e.count, 0);
  const keptEdges = new Set<string>(candidates.filter((e) => isTerminal(e.from) || isTerminal(e.to)).map((e) => e.id));
  let eacc = 0;
  for (const e of inner) {
    if (eacc > 0 && totalInner && eacc / totalInner >= transitionPct / 100) break;
    keptEdges.add(e.id);
    eacc += e.count;
  }
  const vNodes = nodes.filter((n) => keep.has(n.id));
  const vEdges = edges.filter((e) => keptEdges.has(e.id));
  return { nodes: vNodes, edges: vEdges, hiddenActivities: acts.length - (vNodes.length - 2), hiddenTransitions: edges.length - vEdges.length };
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a: string, b: string, t: number) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i]! - v) * t)).join(",")})`;
export const FREQ_GRADIENT = "linear-gradient(90deg,#b8bcc8,#2f399f)";
export const PERF_GRADIENT = "linear-gradient(90deg,#2a9d78,#e5a100,#d64545)";
export const freqColor = (t: number) => lerp("#b8bcc8", "#2f399f", t);
export const perfColor = (t: number) => (t < 0.5 ? lerp("#2a9d78", "#e5a100", t * 2) : lerp("#e5a100", "#d64545", (t - 0.5) * 2));
