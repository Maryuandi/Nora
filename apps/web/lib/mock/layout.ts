import dagre from "@dagrejs/dagre";
import { END_ID, START_ID, type Dfg } from "./eventlog";

export const NODE_SIZE = { activity: { w: 180, h: 56 }, terminal: { w: 56, h: 56 } };

/** Center position of every node, computed once from the full DFG (left to right). */
export function layoutDfg(dfg: Dfg): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  // Safe dagre names: graphlib keys plain objects, so ids like "__proto__" would break it.
  const safe = new Map(dfg.nodes.map((n, i) => [n.id, `n${i}`]));
  for (const n of dfg.nodes) {
    const s = n.id === START_ID || n.id === END_ID ? NODE_SIZE.terminal : NODE_SIZE.activity;
    g.setNode(safe.get(n.id)!, { width: s.w, height: s.h });
  }
  const seen = new Set<string>();
  for (const e of dfg.edges) {
    if (e.from === e.to || !safe.has(e.from) || !safe.has(e.to)) continue;
    const key = [safe.get(e.from)!, safe.get(e.to)!].sort().join("\u0000"); // one layout edge per pair, either direction
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(safe.get(e.from)!, safe.get(e.to)!);
  }
  dagre.layout(g);
  return Object.fromEntries(
    [...safe].map(([id, name]) => {
      const p = g.node(name);
      return [id, { x: Math.round(p.x), y: Math.round(p.y) }];
    }),
  );
}
