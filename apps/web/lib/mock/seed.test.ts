import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import { projectCanonicalLabels } from "./rules";
import { FIXTURE } from "./assessment-data";

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

describe("seed assessments", () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  it("are consistent with findings and candidates", () => {
    expect(s.assessments.length).toBeGreaterThan(0);
    for (const a of s.assessments) {
      const f = s.findings.find((x) => x.id === a.findingId);
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
