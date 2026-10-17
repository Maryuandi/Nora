import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import { buildGraph, lineage } from "./graph";
import { projectCanonicalLabels } from "./rules";

describe("seed mappings", () => {
  it("refer to consistent source/snapshot/project and real columns", () => {
    expect(s.mappings.length).toBeGreaterThan(0);
    for (const m of s.mappings) {
      const src = s.sources.find((x) => x.id === m.sourceId);
      const snap = s.snapshots.find((x) => x.id === m.snapshotId);
      expect(src?.projectId).toBe(m.projectId);
      expect(snap?.sourceId).toBe(m.sourceId);
      expect(snap?.projectId).toBe(m.projectId);
      const cols = snap?.columns?.map((c) => c.name) ?? [];
      for (const k of Object.keys(m.roles)) expect(cols).toContain(k);
    }
  });
});

describe("seed rules", () => {
  it("satisfy basic invariants", () => {
    expect(s.rules.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    const approved = new Set<string>();
    for (const r of s.rules) {
      expect(s.projects.some((p) => p.id === r.projectId)).toBe(true);
      expect(r.version).toBeGreaterThanOrEqual(1);
      const k = `${r.ruleKey}@${r.version}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
      if (r.status === "disetujui") {
        expect(approved.has(r.ruleKey)).toBe(false);
        approved.add(r.ruleKey);
        expect(r.approvedBy).toBeTruthy();
      }
    }
  });
});

describe("seed rule activities", () => {
  it("all exist in the project's canonical labels", () => {
    for (const r of s.rules) {
      const labels = projectCanonicalLabels(s, r.projectId);
      const p = r.params;
      const acts = p.type === "sla" ? [p.from, p.to] : p.type === "urutan" ? [p.before, p.after] : p.type === "pemisahan_tugas" ? [p.activityA, p.activityB] : [p.activity];
      for (const a of acts) expect(labels, `${r.id}: ${a}`).toContain(a);
    }
  });
});

describe("seed graph", () => {
  it("findings, bundles and status point at real projects and nodes", () => {
    const nodeIds = new Set(s.graphNodes.map((n) => n.id));
    const derived = new Set([...s.sources, ...s.snapshots, ...s.mappings, ...s.rules].map((x) => x.id));
    const known = (id: string) => nodeIds.has(id) || derived.has(id);
    for (const f of s.findings) {
      expect(s.projects.some((p) => p.id === f.projectId)).toBe(true);
      expect(nodeIds.has(f.analysisId)).toBe(true);
    }
    for (const b of s.bundles) {
      expect(nodeIds.has(b.target)).toBe(true);
      for (const i of b.items) expect(known(i.nodeId)).toBe(true);
      for (const e of b.excluded) expect(known(e.nodeId)).toBe(true);
    }
    expect(s.graphStatus["p-p2p"]).toBeDefined();
    expect(s.graphStatus["p-o2c"]).toBeDefined();
  });

  it("limited-context bundle exists and full bundle has 7 items, 3 excluded", () => {
    const b1 = s.bundles.find((b) => b.id === "b-1")!;
    expect(b1.items.length).toBe(7);
    expect(b1.excluded.length).toBe(3);
    expect(s.bundles.find((b) => b.id === "b-2")?.limitedContext).toBe(true);
  });
});

describe("seed graph (resolved via buildGraph)", () => {
  const reasons = ["dikecualikan karena anggaran", "di luar hak akses"];
  it("every project's edges, bundles and findings resolve", () => {
    for (const p of s.projects) {
      const g = buildGraph(s, p.id);
      const ids = new Set(g.nodes.map((n) => n.id));
      for (const n of g.nodes) expect(n.projectId).toBe(p.id);
      for (const e of g.edges) {
        expect(e.projectId, e.id).toBe(p.id);
        expect(ids.has(e.from), `${e.id} from ${e.from}`).toBe(true);
        expect(ids.has(e.to), `${e.id} to ${e.to}`).toBe(true);
      }
      for (const f of s.findings.filter((x) => x.projectId === p.id)) {
        expect(lineage(g, f.id)!.nodes.some((n) => n.kind === "Snapshot"), f.id).toBe(true);
      }
      for (const b of s.bundles.filter((x) => x.projectId === p.id)) {
        expect(ids.has(b.assessmentId), b.id).toBe(true);
        for (const i of b.items) expect(ids.has(i.nodeId), i.nodeId).toBe(true);
        for (const x of b.excluded) {
          expect(ids.has(x.nodeId), x.nodeId).toBe(true);
          expect(reasons).toContain(x.reason);
        }
      }
    }
  });
});
