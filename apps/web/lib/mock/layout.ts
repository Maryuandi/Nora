import dagre from "@dagrejs/dagre";
import { END_ID, START_ID, type Dfg } from "./eventlog";

export const NODE_SIZE = { activity: { w: 180, h: 56 }, terminal: { w: 56, h: 56 } };

/** Center position of every node, computed once from the full DFG (left to right). */
export function layoutDfg(dfg: Dfg): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(dfg.nodes.map((n) => n.id));
  for (const n of dfg.nodes) {
    const s = n.id === START_ID || n.id === END_ID ? NODE_SIZE.terminal : NODE_SIZE.activity;
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  const seen = new Set<string>();
  for (const e of dfg.edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const key = [e.from, e.to].sort().join("\u0000"); // one layout edge per pair, either direction
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(e.from, e.to);
  }
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  for (const id of ids) {
    const p = g.node(id);
    out[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  return out;
}
