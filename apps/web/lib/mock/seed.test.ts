import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
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
