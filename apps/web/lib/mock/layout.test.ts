import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { END_ID, eventLogFor, START_ID, type Dfg } from "./eventlog";
import { layoutDfg, NODE_SIZE } from "./layout";

const node = (id: string) => ({ id, label: id, caseCount: 1, eventCount: 1 });
const edge = (from: string, to: string) => ({ id: `${from}>${to}`, from, to, count: 1, caseCount: 1, medianMs: 0, p90Ms: 0 });
const size = (id: string) => (id === START_ID || id === END_ID ? NODE_SIZE.terminal : NODE_SIZE.activity);

function overlaps(dfg: Dfg, pos: Record<string, { x: number; y: number }>) {
  const ids = dfg.nodes.map((n) => n.id);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos[ids[i]], b = pos[ids[j]], sa = size(ids[i]), sb = size(ids[j]);
      if (Math.abs(a.x - b.x) < (sa.w + sb.w) / 2 && Math.abs(a.y - b.y) < (sa.h + sb.h) / 2) return true;
    }
  return false;
}

const seed = eventLogFor(initialState, "p-p2p")!.dfg;

describe("layoutDfg", () => {
  it("positions every seed node with finite numbers", () => {
    const pos = layoutDfg(seed);
    for (const n of seed.nodes) {
      expect(Number.isFinite(pos[n.id].x)).toBe(true);
      expect(Number.isFinite(pos[n.id].y)).toBe(true);
    }
  });
  it("is deterministic", () => expect(layoutDfg(seed)).toEqual(layoutDfg(seed)));
  it("has no overlapping boxes", () => expect(overlaps(seed, layoutDfg(seed))).toBe(false));
  it("lays out left to right", () => {
    const pos = layoutDfg(seed);
    expect(pos[START_ID].x).toBeLessThan(pos[END_ID].x);
  });
  it("survives a single activity with a loop", () => {
    const dfg: Dfg = { nodes: [node(START_ID), node("A"), node(END_ID)], edges: [edge(START_ID, "A"), edge("A", "A"), edge("A", END_ID)], totalCases: 1 };
    const pos = layoutDfg(dfg);
    expect(Object.keys(pos).sort()).toEqual([END_ID, START_ID, "A"].sort());
    for (const p of Object.values(pos)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
  it("survives no edges", () => {
    const dfg: Dfg = { nodes: [node("A"), node("B")], edges: [], totalCases: 0 };
    const pos = layoutDfg(dfg);
    expect(Object.keys(pos)).toHaveLength(2);
    for (const p of Object.values(pos)) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
  it("handles a bidirectional pair", () => {
    const dfg: Dfg = { nodes: [node("A"), node("B")], edges: [edge("A", "B"), edge("B", "A")], totalCases: 1 };
    const pos = layoutDfg(dfg);
    expect(Object.keys(pos)).toHaveLength(2);
    expect(overlaps(dfg, pos)).toBe(false);
  });
  it("survives hostile node ids without polluting prototypes", () => {
    const ids = [START_ID, "constructor", "__proto__", "toString", END_ID];
    const dfg: Dfg = { nodes: ids.map(node), edges: ids.slice(1).map((id, i) => edge(ids[i], id)), totalCases: 1 };
    const before = Object.keys(Object.prototype);
    const pos = layoutDfg(dfg);
    for (const id of ids) {
      expect(Object.hasOwn(pos, id)).toBe(true);
      expect(Number.isFinite(pos[id].x) && Number.isFinite(pos[id].y)).toBe(true);
    }
    expect(Object.keys(Object.prototype)).toEqual(before);
    expect(layoutDfg(dfg)).toEqual(pos);
  });
});
