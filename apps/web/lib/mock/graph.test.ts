import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { bundleBudgetUsage, buildGraph, freshness, layoutLevels, lineage, neighborhood } from "./graph";
import type { GraphEdge, GraphNode, GraphStatus } from "./types";

const fresh = () => structuredClone(initialState);
const ids = (ns: GraphNode[]) => new Set(ns.map((n) => n.id));
const hasEdge = (es: GraphEdge[], from: string, type: string, to: string) => es.some((e) => e.from === from && e.type === type && e.to === to);

describe("buildGraph", () => {
  it("keeps only the project's nodes and edges", () => {
    const s = fresh();
    const o2c = buildGraph(s, "p-o2c");
    expect(o2c.nodes.every((n) => n.projectId === "p-o2c")).toBe(true);
    expect(o2c.edges.every((e) => e.projectId === "p-o2c")).toBe(true);
    expect(ids(o2c.nodes).has("f-sla")).toBe(false);
    const p2p = ids(buildGraph(s, "p-p2p").nodes);
    for (const id of ["sn-1", "m-1", "r-sla-2", "s-p2p-sap"]) expect(p2p.has(id)).toBe(true);
  });

  it("derives snapshot->source, mapping->snapshot and SUPERSEDES edges", () => {
    const g = buildGraph(fresh(), "p-p2p");
    expect(hasEdge(g.edges, "sn-1", "DERIVED_FROM", "s-p2p-sap")).toBe(true);
    expect(hasEdge(g.edges, "m-1", "DERIVED_FROM", "sn-1")).toBe(true);
    const sup = g.edges.find((e) => e.from === "r-sla-2" && e.to === "r-sla-1" && e.type === "SUPERSEDES");
    expect(sup?.category).toBe("keputusan");
  });

  it("rule MENTIONS activity edges come from params labels", () => {
    const g = buildGraph(fresh(), "p-p2p");
    for (const a of ["act-po", "act-gr"]) {
      const e = g.edges.find((x) => x.from === "r-sla-2" && x.to === a && x.type === "MENTIONS");
      expect(e?.category).toBe("asal_usul");
    }
  });

  it("marks supersededBy", () => {
    const s = fresh();
    const g = buildGraph(s, "p-p2p");
    expect(g.nodes.find((n) => n.id === "r-sla-1")?.supersededBy).toBe("r-sla-2");
    expect(g.nodes.find((n) => n.id === "r-sla-2")?.supersededBy).toBeUndefined();
    const m1 = s.mappings.find((m) => m.id === "m-1")!;
    s.mappings.push({ ...m1, id: "m-1-v2", version: 2 });
    expect(buildGraph(s, "p-p2p").nodes.find((n) => n.id === "m-1")?.supersededBy).toBe("m-1-v2");
  });
});

describe("lineage", () => {
  const g = buildGraph(fresh(), "p-p2p");

  it("lineage(f-sla) reaches snapshot and document, ignores hypothesis/decision/bundle", () => {
    const l = lineage(g, "f-sla")!;
    const got = ids(l.nodes);
    for (const id of ["an-q3", "md-cycle", "m-1", "sn-1", "r-sla-1", "doc-sop", "act-gr"]) expect(got.has(id)).toBe(true);
    for (const id of ["hyp-approval", "dec-1", "b-1", "as-jev-1", "r-sla-2"]) expect(got.has(id)).toBe(false);
    expect(l.levels[0].map((n) => n.id)).toEqual(["f-sla"]);
    expect(lineage(g, "zzz")).toBeNull();
  });

  it("lineage(f-idle) has no Rule node", () => {
    expect(lineage(g, "f-idle")!.nodes.some((n) => n.kind === "Rule")).toBe(false);
  });
});

describe("neighborhood", () => {
  const g = buildGraph(fresh(), "p-p2p");
  const grp = (r: ReturnType<typeof neighborhood>, c: string) => r!.find((x) => x.category === c)!;

  it("groups act-gr neighbours by category", () => {
    const r = neighborhood(g, "act-gr");
    const obs = grp(r, "observasi").items.map((i) => i.node.id);
    expect(obs).toContain("f-sla");
    expect(obs).toContain("act-ci");
    expect(grp(r, "dukungan_hipotesis").items.map((i) => i.node.id)).toContain("hyp-approval");
    const asal = grp(r, "asal_usul").items;
    expect(asal.some((i) => i.node.kind === "Rule" && i.edge.type === "MENTIONS")).toBe(true);
    expect(neighborhood(g, "zzz")).toBeNull();
  });

  it("truncates at perGroup and expands", () => {
    const big = { nodes: [...g.nodes], edges: [...g.edges] };
    for (let i = 0; i < 60; i++) {
      big.nodes.push({ id: `syn-${i}`, projectId: "p-p2p", kind: "Activity", label: `Synthetic ${String(i).padStart(2, "0")}`, module: "M03", href: null });
      big.edges.push({ id: `syn-e-${i}`, projectId: "p-p2p", from: "act-gr", to: `syn-${i}`, type: "CO_OCCURS_WITH", category: "observasi", createdBy: "sistem", status: "aktif", recordId: `rec-s${i}`, at: "2026-10-17T00:00:00Z" });
    }
    const def = grp(neighborhood(big, "act-gr"), "observasi");
    expect(def.items.length).toBe(50);
    expect(def.hidden).toBeGreaterThanOrEqual(10);
    expect(grp(neighborhood(big, "act-gr", { expanded: new Set(["observasi"]) }), "observasi").hidden).toBe(0);
  });
});

describe("freshness", () => {
  const st = (lag: number): GraphStatus => ({ version: 1, projectedAt: new Date(Date.UTC(2026, 9, 17, 9, 0, 0) - lag * 1000).toISOString(), authoritativeAt: "2026-10-17T09:00:00.000Z", failed: [], rebuilding: false });
  it("computes lag and staleness", () => {
    expect(freshness(initialState.graphStatus["p-p2p"])).toEqual({ lagSeconds: 40, stale: false });
    expect(freshness(initialState.graphStatus["p-o2c"]).stale).toBe(true);
    expect(freshness(st(300)).stale).toBe(false);
    expect(freshness(st(301)).stale).toBe(true);
  });
});

describe("bundleBudgetUsage", () => {
  it("counts items and tokens", () => {
    const b = initialState.bundles.find((x) => x.id === "b-1")!;
    const u = bundleBudgetUsage(b);
    expect(u.items).toBe(7);
    expect(u.tokens).toBe(b.items.reduce((a, i) => a + i.tokens, 0));
    expect(u.overItems).toBe(false);
    expect(u.overTokens).toBe(false);
  });
});

describe("layoutLevels", () => {
  it("x rises per level, y unique within a level", () => {
    const mk = (id: string): GraphNode => ({ id, projectId: "p", kind: "Finding", label: id, module: "M06", href: null });
    const pos = layoutLevels([[mk("a")], [mk("b"), mk("c")], [mk("d")]]);
    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.d.x);
    expect(pos.b.y).not.toBe(pos.c.y);
  });
});
