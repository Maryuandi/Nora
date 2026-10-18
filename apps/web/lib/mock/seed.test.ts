import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import { buildGraph, lineage } from "./graph";
import { projectCanonicalLabels } from "./rules";
import { FIXTURE } from "./assessment-data";
import { linkFreshness, unreviewedModelOutputs } from "./investigation";

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

describe("seed findings", () => {
  it("has exactly the seven p-p2p findings with consistent evidence", () => {
    expect(s.findings.map((f) => f.id)).toEqual(["finding_42", "finding_57", "finding_63", "assess_71", "compare_81", "scenario_91", "pilot_95"]);
    expect(s.findings.map((f) => f.kind)).toEqual(["temuan", "temuan", "temuan", "penilaian_kandidat", "perbandingan", "skenario", "uji_coba"]);
    for (const f of s.findings) {
      expect(f.projectId).toBe("p-p2p");
      expect(f.evidence.some((e) => e.id === f.id)).toBe(true);
      const ids = f.evidence.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const e of f.evidence)
        for (const m of Object.values(e.metrics ?? {})) expect(Number.isFinite(m.value)).toBe(true);
      expect(f.evidence.some((e) => e.kind === "kandidat" && e.validated === true)).toBe(true);
      expect(f.limitedContext).toBe(f.id === "finding_63" || f.id === "pilot_95");
      expect(f.evidence.length).toBeGreaterThanOrEqual(f.kind === "temuan" ? 4 : 5);
      if (f.kind !== "temuan") {
        expect(f.evidence.some((e) => e.kind === "kandidat" && e.validated === false)).toBe(true);
        expect(f.evidence.some((e) => e.kind === "aturan")).toBe(true);
        expect(f.evidence.some((e) => e.measured)).toBe(true);
      }
    }
  });
});

describe("seed interpretations", () => {
  it("has seven p-p2p drafts with the expected statuses", () => {
    expect(s.interpretations.map((i) => i.findingId)).toEqual(["finding_42", "finding_57", "finding_63", "assess_71", "compare_81", "scenario_91", "pilot_95"]);
    expect(s.interpretations.map((i) => i.id)).toEqual(["i-seed-42", "i-seed-57", "i-seed-63", "i-seed-71", "i-seed-81", "i-seed-91", "i-seed-95"]);
    expect(s.interpretations.map((i) => i.status)).toEqual(["lolos_pemeriksaan", "lolos_pemeriksaan", "gagal_pemeriksaan", "lolos_pemeriksaan", "lolos_pemeriksaan", "lolos_pemeriksaan", "lolos_pemeriksaan"]);
    expect(s.interpretations.find((i) => i.findingId === "compare_81")!.attempts).toHaveLength(2);
    for (const i of s.interpretations) expect(i).toMatchObject({ projectId: "p-p2p", createdBy: "u-dimas", overrides: [], templateVersion: "tiruan-1", model: "model-tiruan" });
    expect(new Set(s.interpretations.map((i) => i.createdAt)).size).toBe(7);
  });
  it("cites only evidence that exists in the last attempt", () => {
    for (const i of s.interpretations) {
      const ids = new Set(s.findings.find((f) => f.id === i.findingId)!.evidence.map((e) => e.id));
      const last = i.attempts[i.attempts.length - 1];
      for (const c of last.sections.flatMap((x) => x.claims).flatMap((c) => c.citations)) expect(ids.has(c)).toBe(true);
    }
  });
  it("recommendation claims reference validated candidates only", () => {
    for (const i of s.interpretations) {
      const f = s.findings.find((x) => x.id === i.findingId)!;
      const last = i.attempts[i.attempts.length - 1];
      for (const c of last.sections.flatMap((x) => x.claims).filter((c) => c.type === "rekomendasi_tervalidasi"))
        expect(f.evidence.find((e) => e.id === c.candidateId)).toMatchObject({ kind: "kandidat", validated: true });
    }
  });
});

describe("seed M11", () => {
  const unique = (xs: { id: string }[]) => expect(new Set(xs.map((x) => x.id)).size).toBe(xs.length);
  it("has unique ids per collection and everything in p-p2p", () => {
    for (const c of [s.investigations, s.links, s.notes, s.comments, s.notifications, s.decisions]) unique(c);
    expect(s.investigations.map((i) => i.id)).toEqual(["inv-1", "inv-2"]);
    for (const i of s.investigations) expect(i.projectId).toBe("p-p2p");
    for (const col of [s.links, s.notes, s.comments, s.decisions])
      for (const x of col) expect(s.investigations.some((i) => i.id === x.investigationId)).toBe(true);
    for (const d of s.decisions) expect(d.projectId).toBe("p-p2p");
    expect(s.analysisStates).toEqual([
      { projectId: "p-p2p", datasetVersion: "ds-2", contextPackage: "ctx-4", analysis: "analisis-3", evidencePackage: "bukti-7", metricValues: { "finding_42.p90_days": 18.4 }, ruleVersions: { "r-sla": "v2" } },
    ]);
    expect(s.reviews).toEqual([]);
    expect(s.proposals).toEqual([]);
  });
  it("links point at existing objects and are not stale", () => {
    const evidence = s.findings.flatMap((f) => f.evidence);
    expect(s.links.filter((l) => l.investigationId === "inv-1").map((l) => `${l.kind}:${l.targetId}`)).toEqual([
      "temuan:finding_42", "aturan:r-sla", "kandidat:cand_1", "kandidat:cand_2", "hasil_jev:jev_42", "interpretasi:i-seed-42",
    ]);
    for (const l of s.links) {
      if (l.kind === "aturan") expect(s.rules.some((r) => r.ruleKey === l.targetId)).toBe(true);
      else if (l.kind === "interpretasi") expect(s.interpretations.some((i) => i.id === l.targetId)).toBe(true);
      else expect(evidence.some((e) => e.id === l.targetId && e.kind === l.kind)).toBe(true);
      expect(linkFreshness(s, l).stale).toBe(false);
    }
  });
  it("has unreviewed model outputs in inv-1", () => {
    expect(unreviewedModelOutputs(s, "inv-1").length).toBeGreaterThanOrEqual(1);
  });
  it("has notes, thread, notification and a complete rejected decision", () => {
    expect(s.notes.map((n) => n.kind).sort()).toEqual(["hipotesis", "pertanyaan", "wawancara"]);
    const root = s.comments.find((c) => c.parentId === null)!;
    expect(root).toMatchObject({ createdBy: "u-sari", mentions: ["u-dimas"] });
    expect(root.body).toContain("@Dimas");
    const n = s.notifications.find((x) => x.userId === "u-dimas")!;
    expect(n.href).toBe("/projects/p-p2p/investigations/inv-1");
    const [d] = s.decisions;
    expect(s.decisions).toHaveLength(1);
    expect(d).toMatchObject({ investigationId: "inv-2", status: "ditolak", version: 1, byId: "u-dimas", byRole: "analis" });
    expect(d.reason.trim()).not.toBe("");
    expect(s.links.find((l) => l.id === d.targetLinkId)).toMatchObject({ investigationId: "inv-2", kind: "kandidat" });
    for (const [k, v] of Object.entries(d.snapshot)) { if (k !== "metricValues" && k !== "ruleVersions") expect(v).toBeTruthy(); else expect(Object.keys(v).length).toBeGreaterThan(0); }
    expect(s.flags).toEqual([]);
  });
  it("has no timestamps after MOCK_TODAY", () => {
    const ts = [...s.investigations, ...s.links, ...s.notes, ...s.comments, ...s.decisions].map((x) => ("at" in x ? x.at : x.createdAt));
    for (const t of [...ts, ...s.notifications.map((x) => x.at)]) expect(t.slice(0, 10) <= "2026-10-17").toBe(true);
  });
});

describe("seed graph", () => {
  it("findings, bundles and status point at real projects and nodes", () => {
    const nodeIds = new Set(s.graphNodes.map((n) => n.id));
    const derived = new Set([...s.sources, ...s.snapshots, ...s.mappings, ...s.rules].map((x) => x.id));
    const known = (id: string) => nodeIds.has(id) || derived.has(id);
    // Raw entries: buildGraph filters by project, so asserting on its output alone could never fail.
    for (const n of s.graphNodes) expect(s.projects.some((p) => p.id === n.projectId), n.id).toBe(true);
    for (const e of s.graphEdges) expect(s.projects.some((p) => p.id === e.projectId), e.id).toBe(true);
    for (const f of s.traceFindings) {
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
      for (const f of s.traceFindings.filter((x) => x.projectId === p.id)) {
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

describe("seed assessments", () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  it("are consistent with findings and candidates", () => {
    expect(s.assessments.length).toBeGreaterThan(0);
    for (const a of s.assessments) {
      const f = s.assessFindings.find((x) => x.id === a.findingId);
      const c = s.candidates.find((x) => x.id === a.candidateId);
      expect(f).toBeTruthy();
      expect(c).toBeTruthy();
      expect(f!.candidateIds).toContain(a.candidateId);
      expect(a.id).toContain(a.candidateId);
      expect(sum(Object.values(a.relevance.probs))).toBeCloseTo(1, 9);
      for (const sc of a.scores) {
        expect(sc.probs).toHaveLength(5);
        expect(sum(sc.probs)).toBeCloseTo(1, 9);
      }
    }
  });
  it("candidate criteria weights sum to 1 with 5-level scales", () => {
    for (const c of s.candidates) {
      expect(sum(c.criteria.map((k) => k.weight))).toBeCloseTo(1, 9);
      for (const k of c.criteria) expect(k.scale.map((x) => x.level)).toEqual([1, 2, 3, 4, 5]);
    }
  });
  it("leave c6 (not applicable) and c9 (not yet assessed) without results", () => {
    expect(s.assessments.some((a) => a.candidateId === "c6")).toBe(false);
    expect(s.assessments.some((a) => a.candidateId === "c9")).toBe(false);
    expect(s.candidates.find((c) => c.id === "c6")?.applicable).toBe(false);
  });
});

describe("assessment fixture", () => {
  it("has no more levels than the candidate has criteria", () => {
    for (const c of s.candidates) if (FIXTURE[c.id]) expect(FIXTURE[c.id].levels.length).toBeLessThanOrEqual(c.criteria.length);
  });
});

describe("seed classification", () => {
  const ids = s.classItems.map((i) => i.id);
  it("has 20 activities and 16 synthetic notes with unique ids", () => {
    expect(s.classItems.filter((i) => i.task === "aktivitas")).toHaveLength(20);
    expect(s.classItems.filter((i) => i.task === "catatan")).toHaveLength(16);
    expect(new Set(ids).size).toBe(36);
    for (const i of s.classItems) expect(i.synthetic).toBe(i.task === "catatan");
  });
  it("notes read as 8-20 word sentences", () => {
    for (const i of s.classItems.filter((x) => x.task === "catatan")) {
      const n = i.text.trim().split(/\s+/).length;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(20);
    }
  });
  it("results sum to 1, match spec keys, and exactly six need review", () => {
    expect(s.classResults).toHaveLength(36);
    for (const r of s.classResults) {
      const spec = s.specs.find((x) => x.task === r.task && x.version === r.specVersion)!;
      expect(Object.keys(r.probs).sort()).toEqual(spec.categories.map((c) => c.key).sort());
      expect(Math.abs(Object.values(r.probs).reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
    }
    expect(s.classResults.filter((r) => r.status === "perlu_review").map((r) => r.itemId).sort()).toEqual(["a02", "a06", "a14", "a18", "n11", "n14"]);
    expect(s.classResults.filter((r) => r.status === "gagal")).toHaveLength(0);
  });
});
