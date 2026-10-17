import { Compass, GitBranch, Lightbulb, Scales, type Icon } from "@phosphor-icons/react";
import type { EvidenceBundle, GraphEdge, GraphNode, GraphStatus, MockState, RelationCategory, RuleVersion } from "./types";

export const RELATION_META: Record<RelationCategory, { label: string; icon: Icon; tone: string; unproven: boolean }> = {
  asal_usul: { label: "Asal-usul", icon: GitBranch, tone: "accent", unproven: false },
  observasi: { label: "Observasi", icon: Compass, tone: "ink", unproven: false },
  dukungan_hipotesis: { label: "Dukungan hipotesis", icon: Lightbulb, tone: "warning", unproven: true },
  keputusan: { label: "Keputusan", icon: Scales, tone: "neutral", unproven: false },
};
const CATEGORY_ORDER = Object.keys(RELATION_META) as RelationCategory[];

export interface BuiltGraph { nodes: GraphNode[]; edges: GraphEdge[] }

const ruleActivities = (r: RuleVersion): string[] => {
  const p = r.params;
  return p.type === "sla" ? [p.from, p.to] : p.type === "urutan" ? [p.before, p.after] : p.type === "pemisahan_tugas" ? [p.activityA, p.activityB] : [p.activity];
};

export function buildGraph(state: MockState, projectId: string): BuiltGraph {
  const inProject = <T extends { projectId: string }>(xs: T[]) => xs.filter((x) => x.projectId === projectId);
  const nodes: GraphNode[] = inProject(state.graphNodes).map((n) => ({ ...n }));
  const edges: GraphEdge[] = [...inProject(state.graphEdges)];
  const derive = (from: string, type: string, to: string, createdBy: GraphEdge["createdBy"], category: RelationCategory, at: string) =>
    edges.push({ id: `d-${from}-${type}-${to}`, projectId, from, to, type, category, createdBy, status: "aktif", recordId: `d-${from}-${type}-${to}`, at });

  for (const x of inProject(state.sources))
    nodes.push({ id: x.id, projectId, kind: "Source", label: x.name, module: "M02", href: `/projects/${projectId}/sources/${x.id}` });
  for (const x of inProject(state.snapshots)) {
    nodes.push({ id: x.id, projectId, kind: "Snapshot", label: x.fileName, module: "M02", href: `/projects/${projectId}/snapshots/${x.id}` });
    derive(x.id, "DERIVED_FROM", x.sourceId, "sistem", "asal_usul", x.uploadedAt);
  }
  const mappings = inProject(state.mappings);
  for (const x of mappings) {
    const newer = mappings.filter((m) => m.sourceId === x.sourceId && m.version > x.version).sort((a, b) => a.version - b.version)[0];
    nodes.push({ id: x.id, projectId, kind: "MappingVersion", label: `v${x.version}`, module: "M03", href: `/projects/${projectId}/sources/${x.sourceId}/mapping`, ...(newer ? { supersededBy: newer.id } : {}) });
    derive(x.id, "DERIVED_FROM", x.snapshotId, "sistem", "asal_usul", x.createdAt);
  }

  const activityByLabel = new Map(nodes.filter((n) => n.kind === "Activity").map((n) => [n.label, n.id]));
  const rules = inProject(state.rules);
  for (const r of rules) {
    const newer = rules.filter((o) => o.ruleKey === r.ruleKey && o.version > r.version).sort((a, b) => a.version - b.version)[0];
    nodes.push({ id: r.id, projectId, kind: "Rule", label: r.name, sublabel: `v${r.version}`, module: "M04", href: `/projects/${projectId}/context/rules/${r.ruleKey}`, ...(newer ? { supersededBy: newer.id } : {}) });
    const prev = rules.filter((o) => o.ruleKey === r.ruleKey && o.version < r.version).sort((a, b) => b.version - a.version)[0];
    if (prev) derive(r.id, "SUPERSEDES", prev.id, "pengguna", "keputusan", r.createdAt);
    for (const act of new Set(ruleActivities(r))) {
      const aid = activityByLabel.get(act);
      if (aid) derive(r.id, "MENTIONS", aid, "sistem", "asal_usul", r.createdAt);
    }
  }
  return { nodes, edges };
}

const byLabel = (a: GraphNode, b: GraphNode) => a.label.localeCompare(b.label);

export interface LineageResult { root: GraphNode; levels: GraphNode[][]; nodes: GraphNode[]; edges: GraphEdge[] }
export function lineage(graph: BuiltGraph, findingId: string): LineageResult | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const root = byId.get(findingId);
  if (!root) return null;
  const follows = (e: GraphEdge) => (e.category === "asal_usul" && e.type !== "MENTIONS") || e.type === "OBSERVED_AT";
  const depth = new Map([[root.id, 0]]);
  const edges: GraphEdge[] = [];
  for (let frontier = [root.id]; frontier.length; ) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of graph.edges) {
        if (e.from !== id || !follows(e) || !byId.has(e.to)) continue;
        edges.push(e);
        if (!depth.has(e.to)) { depth.set(e.to, depth.get(id)! + 1); next.push(e.to); }
      }
    }
    frontier = next;
  }
  const levels: GraphNode[][] = [];
  for (const [id, d] of depth) (levels[d] ??= []).push(byId.get(id)!);
  levels.forEach((l) => l.sort(byLabel));
  return { root, levels, nodes: levels.flat(), edges };
}

export interface NeighborItem { node: GraphNode; edge: GraphEdge; direction: "keluar" | "masuk" }
export interface NeighborGroup { category: RelationCategory; items: NeighborItem[]; total: number; hidden: number }
export function neighborhood(graph: BuiltGraph, nodeId: string, opts: { perGroup?: number; expanded?: ReadonlySet<RelationCategory> } = {}): NeighborGroup[] | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!byId.has(nodeId)) return null;
  const perGroup = opts.perGroup ?? 50;
  const groups = new Map<RelationCategory, Map<string, NeighborItem>>();
  for (const e of graph.edges) {
    if (e.from !== nodeId && e.to !== nodeId) continue;
    const out = e.from === nodeId;
    const node = byId.get(out ? e.to : e.from);
    if (!node) continue;
    const g = groups.get(e.category) ?? new Map<string, NeighborItem>();
    if (!g.has(node.id)) g.set(node.id, { node, edge: e, direction: out ? "keluar" : "masuk" });
    groups.set(e.category, g);
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => {
    const all = [...groups.get(category)!.values()].sort((a, b) => byLabel(a.node, b.node));
    const items = opts.expanded?.has(category) ? all : all.slice(0, perGroup);
    return { category, items, total: all.length, hidden: all.length - items.length };
  });
}

export function freshness(status: GraphStatus, thresholdMin = 5): { lagSeconds: number; stale: boolean } {
  const lagSeconds = Math.max(0, Math.round((Date.parse(status.authoritativeAt) - Date.parse(status.projectedAt)) / 1000));
  return { lagSeconds, stale: lagSeconds > thresholdMin * 60 };
}

export function bundleBudgetUsage(bundle: EvidenceBundle) {
  const items = bundle.items.length;
  const tokens = bundle.items.reduce((a, i) => a + i.tokens, 0);
  return { items, tokens, overItems: items > bundle.budget.items, overTokens: tokens > bundle.budget.tokens };
}

export function layoutLevels(levels: GraphNode[][]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  levels.forEach((l, i) => l.forEach((n, j) => { out[n.id] = { x: i * 280, y: j * 90 }; }));
  return out;
}
