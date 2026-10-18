import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import { projectCanonicalLabels } from "./rules";
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
  it("has exactly the three p-p2p findings with consistent evidence", () => {
    expect(s.findings.map((f) => f.id)).toEqual(["finding_42", "finding_57", "finding_63"]);
    for (const f of s.findings) {
      expect(f.projectId).toBe("p-p2p");
      expect(f.evidence.some((e) => e.id === f.id)).toBe(true);
      const ids = f.evidence.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const e of f.evidence)
        for (const m of Object.values(e.metrics ?? {})) expect(Number.isFinite(m.value)).toBe(true);
      expect(f.evidence.some((e) => e.kind === "kandidat" && e.validated === true)).toBe(true);
      expect(f.limitedContext).toBe(f.id === "finding_63");
    }
  });
});

describe("seed interpretations", () => {
  it("has three p-p2p drafts with the expected statuses", () => {
    expect(s.interpretations.map((i) => i.findingId)).toEqual(["finding_42", "finding_57", "finding_63"]);
    expect(s.interpretations.map((i) => i.status)).toEqual(["lolos_pemeriksaan", "lolos_pemeriksaan", "gagal_pemeriksaan"]);
    for (const i of s.interpretations) expect(i).toMatchObject({ projectId: "p-p2p", createdBy: "u-dimas", overrides: [], templateVersion: "tiruan-1", model: "model-tiruan" });
    expect(new Set(s.interpretations.map((i) => i.createdAt)).size).toBe(3);
  });
  it("cites only evidence that exists in the last attempt", () => {
    for (const i of s.interpretations) {
      const ids = new Set(s.findings.find((f) => f.id === i.findingId)!.evidence.map((e) => e.id));
      const last = i.attempts[i.attempts.length - 1];
      for (const c of last.sections.flatMap((x) => x.claims).flatMap((c) => c.citations)) expect(ids.has(c)).toBe(true);
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
