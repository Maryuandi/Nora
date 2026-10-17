import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { activityLabels } from "./mapping";
import {
  ACTION_LABEL, CHECK_META, VERDICT_LABEL, buildCapabilities, buildQualityReport, datasetHash, excludedAfter, qualityDataset, repairImpact,
  type QualityDataset, type QualityReport,
} from "./quality";
import type { CheckId, ColumnRole, MappingVersion, Project, RepairRule, Snapshot } from "./types";

const ORDER: CheckId[] = ["nilai_hilang", "waktu_tidak_wajar", "duplikasi", "urutan_ambigu", "kasus_belum_selesai", "waktu_mulai_selesai", "label_belum_dipetakan", "di_luar_periode"];

const seed = (): QualityDataset => qualityDataset(initialState, "s-p2p-sap")!;
const withSnap = (d: QualityDataset, patch: Omit<Partial<Snapshot>, "stats"> & { stats?: Partial<NonNullable<Snapshot["stats"]>> }): QualityDataset => {
  const { stats, ...rest } = patch;
  return { ...d, snapshot: { ...structuredClone(d.snapshot), ...rest, stats: { ...d.snapshot.stats!, ...stats } } };
};
const withMap = (d: QualityDataset, patch: Partial<MappingVersion>): QualityDataset => ({ ...d, mapping: { ...structuredClone(d.mapping), ...patch } });
const withProject = (d: QualityDataset, patch: Partial<Project>): QualityDataset => ({ ...d, project: { ...d.project, ...patch } });
const coverAll = (d: QualityDataset): QualityDataset => withMap(d, { labels: activityLabels(d.snapshot).map((l) => ({ raw: l.raw, canonical: l.raw })) });
const rolesWith = (d: QualityDataset, extra: Record<string, ColumnRole>) => ({ ...d.mapping.roles, ...extra });
const find = (r: QualityReport, id: CheckId) => r.findings.find((f) => f.id === id)!;
const rule = (check: CheckId, over: Partial<RepairRule> = {}): RepairRule => ({
  id: `r-${check}`, sourceId: "s-p2p-sap", projectId: "p-p2p", check, action: "kecualikan_event", reason: "uji",
  impactEvents: 10, impactCases: 2, active: true, createdBy: "u-dimas", createdAt: "2026-10-18T00:00:00Z", ...over,
});

// Deterministic search over checksums so synthetic tests cannot pass vacuously.
function pickChecksum(d: QualityDataset, ok: (r: QualityReport) => boolean): QualityDataset {
  for (let i = 0; i < 20000; i++) {
    const cand = withSnap(d, { checksum: `cs${i}` });
    if (ok(buildQualityReport(cand, []))) return cand;
  }
  throw new Error("no checksum satisfies the condition");
}

describe("qualityDataset", () => {
  it("resolves the seed source", () => {
    const d = qualityDataset(initialState, "s-p2p-sap");
    expect(d?.snapshot.id).toBe("sn-1");
    expect(d?.mapping.id).toBe("m-1");
    expect(d?.project.id).toBe("p-p2p");
  });
  it("is null without a mapping or for unknown sources", () => {
    expect(qualityDataset(initialState, "s-p2p-tiket")).toBeNull();
    expect(qualityDataset(initialState, "nope")).toBeNull();
  });
  it("falls back to the newest ready snapshot when the mapped one is not ready", () => {
    const s = structuredClone(initialState);
    s.snapshots.find((x) => x.id === "sn-1")!.status = "perlu_tinjauan";
    s.snapshots.push({ ...structuredClone(s.snapshots.find((x) => x.id === "sn-1")!), id: "sn-1b", status: "siap_dipetakan", uploadedAt: "2026-10-16T00:00:00Z" });
    expect(qualityDataset(s, "s-p2p-sap")?.snapshot.id).toBe("sn-1b");
    s.snapshots.find((x) => x.id === "sn-1b")!.status = "gagal";
    expect(qualityDataset(s, "s-p2p-sap")).toBeNull();
  });
  it("picks the latest mapping, ties by later index", () => {
    const s = structuredClone(initialState);
    s.mappings.push({ ...structuredClone(s.mappings[0]), id: "m-2", version: 2 });
    expect(qualityDataset(s, "s-p2p-sap")?.mapping.id).toBe("m-2");
  });
});

describe("buildQualityReport", () => {
  it("is deterministic with eight findings in CHECK_META order", () => {
    const a = buildQualityReport(seed(), []);
    expect(buildQualityReport(seed(), [])).toEqual(a);
    expect(a.findings.map((f) => f.id)).toEqual(ORDER);
    expect(Object.keys(CHECK_META)).toEqual(ORDER);
    expect(a.findings.map((f) => f.title)).toEqual(ORDER.map((c) => CHECK_META[c].title));
    expect(a.findings.map((f) => f.severity)).toEqual(ORDER.map((c) => CHECK_META[c].severity));
    expect(a.totalEvents).toBe(57_195);
    expect(a.totalCases).toBe(Math.round(57_195 / 6));
    expect(a.snapshotId).toBe("sn-1");
    expect(a.mappingId).toBe("m-1");
  });
  it("has the expected labels", () => {
    expect(VERDICT_LABEL).toEqual({ siap: "Siap analisis", siap_catatan: "Siap dengan catatan", belum_layak: "Belum layak" });
    expect(ACTION_LABEL).toEqual({ kecualikan_event: "Kecualikan event", kecualikan_kasus: "Kecualikan kasus", terima: "Terima apa adanya" });
  });
  it("uses M02 duplicates as-is", () => {
    const d = withSnap(seed(), { stats: { duplicateEvents: 120, conflictEvents: 7 } });
    const f = find(buildQualityReport(d, []), "duplikasi");
    expect(f.affectedEvents).toBe(127);
    expect(f.status).toBe("ditemukan");
    expect(find(buildQualityReport(seed(), []), "duplikasi").status).toBe("bersih");
  });
  it("kasus_belum_selesai is always tidak_diketahui without numbers", () => {
    const f = find(buildQualityReport(seed(), []), "kasus_belum_selesai");
    expect([f.status, f.affectedEvents, f.affectedCases, f.percent, f.examples]).toEqual(["tidak_diketahui", 0, 0, 0, []]);
  });
  it("keeps fractions in the spec ranges", () => {
    for (let i = 0; i < 200; i++) {
      const r = buildQualityReport(withMap(withSnap(seed(), { checksum: `rg${i}` }), { roles: rolesWith(seed(), { start: "timestamp_start" }) }), []);
      const pct = (id: CheckId) => (find(r, id).affectedEvents / r.totalEvents) * 100;
      expect(pct("nilai_hilang")).toBeGreaterThanOrEqual(0.19);
      expect(pct("nilai_hilang")).toBeLessThanOrEqual(3.01);
      expect(pct("waktu_tidak_wajar")).toBeGreaterThanOrEqual(0.09);
      expect(pct("waktu_tidak_wajar")).toBeLessThanOrEqual(1.51);
      expect(pct("waktu_mulai_selesai")).toBeGreaterThanOrEqual(0.09);
      expect(pct("waktu_mulai_selesai")).toBeLessThanOrEqual(1.01);
      const u = find(r, "urutan_ambigu");
      expect(u.affectedEvents).toBe(u.affectedCases * 3);
      expect(u.affectedCases / r.totalCases).toBeGreaterThanOrEqual(0.0199);
      expect(u.affectedCases / r.totalCases).toBeLessThanOrEqual(0.1801);
    }
  });
  it("derives cases from events for event-based checks", () => {
    const r = buildQualityReport(seed(), []);
    const f = find(r, "nilai_hilang");
    expect(f.affectedCases).toBe(Math.min(r.totalCases, Math.ceil(f.affectedEvents / 4)));
  });
  it("waktu_mulai_selesai: tidak_berlaku without timestamp_start, found/clean with it", () => {
    expect(find(buildQualityReport(seed(), []), "waktu_mulai_selesai")).toMatchObject({ status: "tidak_berlaku", affectedEvents: 0 });
    const withStart = withMap(seed(), { roles: rolesWith(seed(), { start: "timestamp_start" }) });
    expect(find(buildQualityReport(withStart, []), "waktu_mulai_selesai").status).toBe("ditemukan");
    const tiny = withSnap(withStart, { stats: { rows: 5 } });
    expect(find(buildQualityReport(tiny, []), "waktu_mulai_selesai").status).toBe("bersih");
  });
  it("label_belum_dipetakan: found on the seed, clean when every variant is covered", () => {
    const f = find(buildQualityReport(seed(), []), "label_belum_dipetakan");
    expect(f.status).toBe("ditemukan");
    expect(f.affectedEvents).toBeGreaterThan(0);
    expect(f.examples.every((e) => e.text.includes("label aktivitas belum dipetakan: "))).toBe(true);
    const clean = find(buildQualityReport(coverAll(seed()), []), "label_belum_dipetakan");
    expect(clean).toMatchObject({ status: "bersih", affectedEvents: 0, examples: [] });
  });
  it("label_belum_dipetakan passes hostile labels through untouched", () => {
    const d = seed();
    const preview = d.snapshot.preview!.map((r, i) => [r[0], i % 2 ? "__proto__" : "__PROTO__.", r[2], r[3]]);
    const hostile = withSnap(d, { preview, columns: d.snapshot.columns });
    const f = find(buildQualityReport(hostile, []), "label_belum_dipetakan");
    expect(["ditemukan", "bersih"]).toContain(f.status);
    const odd = withSnap(d, { preview: [["PO-1", "constructor  ", "t", "u"], ["PO-1", "Constructor;", "t", "u"], ["PO-1", "<b>x</b>\u0000", "t", "u"]] });
    expect(() => buildQualityReport(odd, [])).not.toThrow();
  });
  it("di_luar_periode uses the project contract", () => {
    const base = seed();
    expect(find(buildQualityReport(base, []), "di_luar_periode").status).toBe("ditemukan"); // seed timeFrom 2026-01-02 < contractStart 2026-04-01
    const inside = withSnap(withProject(base, { contractStart: "2026-01-01", contractEnd: "2026-12-31" }), {});
    expect(find(buildQualityReport(inside, []), "di_luar_periode")).toMatchObject({ status: "bersih", affectedEvents: 0 });
    const after = withProject(inside, { contractEnd: "2026-06-30" });
    const f = find(buildQualityReport(after, []), "di_luar_periode");
    expect(f.status).toBe("ditemukan");
    expect(f.affectedEvents).toBeGreaterThan(0);
    expect(f.affectedEvents).toBeLessThan(57_195);
    expect(find(buildQualityReport(withProject(inside, { contractEnd: null }), []), "di_luar_periode").status).toBe("bersih");
    expect(find(buildQualityReport(withSnap(inside, { stats: { timeFrom: "bukan tanggal" } }), []), "di_luar_periode").status).toBe("bersih");
  });
  it("examples are <= 5, ascending, in 1..rows, non-empty", () => {
    for (const rows of [0, 1, 5, 40, 57_195]) {
      for (let i = 0; i < 30; i++) {
        const d = withMap(withSnap(seed(), { checksum: `ex${i}`, stats: { rows, duplicateEvents: 3 } }), { roles: rolesWith(seed(), { start: "timestamp_start" }) });
        for (const f of buildQualityReport(d, []).findings) {
          expect(f.examples.length).toBeLessThanOrEqual(5);
          expect(f.examples.length).toBeLessThanOrEqual(f.affectedEvents);
          const rowsOnly = f.examples.map((e) => e.row);
          expect(rowsOnly).toEqual([...new Set(rowsOnly)].sort((a, b) => a - b));
          for (const e of f.examples) {
            expect(e.row).toBeGreaterThanOrEqual(1);
            expect(e.row).toBeLessThanOrEqual(rows);
            expect(e.text.length).toBeGreaterThan(0);
            expect(e.text.startsWith(`baris ${e.row}: `)).toBe(true);
          }
        }
      }
    }
  });
  it("percent = affected/total*100 to one decimal", () => {
    const r = buildQualityReport(seed(), []);
    for (const f of r.findings) expect(f.percent).toBe(Math.round((f.affectedEvents / r.totalEvents) * 1000) / 10);
  });
  it("rows 0, 1, 5 and missing stats never throw or give NaN", () => {
    for (const rows of [0, 1, 5]) {
      const r = buildQualityReport(withMap(withSnap(seed(), { stats: { rows } }), { roles: rolesWith(seed(), { start: "timestamp_start" }) }), [rule("nilai_hilang")]);
      const nums = [r.totalEvents, r.totalCases, r.excludedEvents, r.excludedCases, r.eventsIncluded, r.casesIncluded, ...r.findings.flatMap((f) => [f.affectedEvents, f.affectedCases, f.percent])];
      expect(nums.every(Number.isFinite)).toBe(true);
      expect(r.eventsIncluded).toBeGreaterThanOrEqual(0);
      expect(r.eventsIncluded).toBeLessThanOrEqual(rows);
      if (rows === 0) expect(r.findings.every((f) => f.examples.length === 0 && f.percent === 0)).toBe(true);
    }
    const noStats = { ...seed(), snapshot: { ...structuredClone(seed().snapshot), stats: undefined } };
    const r = buildQualityReport(noStats, []);
    expect([r.totalEvents, r.totalCases]).toEqual([0, 0]);
  });
});

describe("repair rules", () => {
  it("active exclusion reduces included totals, inactive is ignored", () => {
    const base = buildQualityReport(seed(), []);
    const r = buildQualityReport(seed(), [rule("nilai_hilang", { impactEvents: 100, impactCases: 25 })]);
    expect([r.excludedEvents, r.excludedCases]).toEqual([100, 25]);
    expect(r.eventsIncluded).toBe(base.totalEvents - 100);
    expect(r.casesIncluded).toBe(base.totalCases - 25);
    const off = buildQualityReport(seed(), [rule("nilai_hilang", { impactEvents: 100, impactCases: 25, active: false })]);
    expect(off).toEqual(base);
  });
  it("terima does not exclude, other sources are ignored", () => {
    const base = buildQualityReport(seed(), []);
    expect(buildQualityReport(seed(), [rule("nilai_hilang", { action: "terima" })]).eventsIncluded).toBe(base.eventsIncluded);
    expect(buildQualityReport(seed(), [rule("nilai_hilang", { sourceId: "s-lain" })]).eventsIncluded).toBe(base.eventsIncluded);
  });
  it("caps exclusion at the totals", () => {
    const r = buildQualityReport(seed(), [rule("nilai_hilang", { impactEvents: 10 ** 9, impactCases: 10 ** 9 }), rule("duplikasi", { impactEvents: 5, impactCases: 5 })]);
    expect([r.excludedEvents, r.excludedCases, r.eventsIncluded, r.casesIncluded]).toEqual([r.totalEvents, r.totalCases, 0, 0]);
  });
  it("repairImpact is the finding's own numbers before rules", () => {
    const r = buildQualityReport(seed(), [rule("nilai_hilang")]);
    const f = find(r, "nilai_hilang");
    expect(repairImpact(r, "nilai_hilang")).toEqual({ events: f.affectedEvents, cases: f.affectedCases });
  });
  it("excludedAfter sums active exclusions, adds extra, and caps", () => {
    const r = buildQualityReport(seed(), []);
    const rules = [rule("nilai_hilang", { impactEvents: 100, impactCases: 25 }), rule("duplikasi", { action: "terima", impactEvents: 0, impactCases: 0 }), rule("urutan_ambigu", { active: false })];
    expect(excludedAfter(r, rules)).toEqual({ events: 100, cases: 25 });
    expect(excludedAfter(r, rules, { check: "waktu_tidak_wajar", events: 40, cases: 10 })).toEqual({ events: 140, cases: 35 });
    expect(excludedAfter(r, rules, { check: "waktu_tidak_wajar", events: 10 ** 9, cases: 10 ** 9 })).toEqual({ events: r.totalEvents, cases: r.totalCases });
    expect(excludedAfter(r, [])).toEqual({ events: 0, cases: 0 });
  });
});

describe("verdict", () => {
  it("siap_catatan on the seed (sedang findings and an unknown)", () => {
    const r = buildQualityReport(seed(), []);
    expect(r.verdict).toBe("siap_catatan");
    expect(r.reasons).toContain("Status penyelesaian kasus belum diketahui");
    expect(r.reasons.length).toBeGreaterThan(1);
  });
  it("siap when nothing is open or unknown", () => {
    const clean = withProject(withSnap(coverAll(seed()), { stats: { rows: 5, timeFrom: "2026-05-01", timeTo: "2026-06-01" } }), {});
    const r0 = buildQualityReport(clean, []);
    expect(r0.findings.filter((f) => f.status === "ditemukan")).toEqual([]);
    // the always-unknown case-completion check must be accepted to reach "siap"
    const r = buildQualityReport(clean, [rule("kasus_belum_selesai", { action: "terima", impactEvents: 0, impactCases: 0 })]);
    expect(r.verdict).toBe("siap");
    expect(r.reasons).toEqual([]);
    expect(r0.verdict).toBe("siap_catatan");
  });
  it("accepting or excluding sedang findings clears the note", () => {
    const quiet = (r: QualityReport) => r.findings.every((f) => f.id === "urutan_ambigu" || f.id === "kasus_belum_selesai" || f.status !== "ditemukan");
    const d = pickChecksum(withSnap(coverAll(seed()), { stats: { rows: 60, timeFrom: "2026-05-01", timeTo: "2026-06-01" } }), (r) => quiet(r) && find(r, "urutan_ambigu").status === "ditemukan");
    const f = find(buildQualityReport(d, []), "urutan_ambigu");
    const open = buildQualityReport(d, [rule("kasus_belum_selesai", { action: "terima" })]);
    expect(open.verdict).toBe("siap_catatan");
    const handled = buildQualityReport(d, [rule("kasus_belum_selesai", { action: "terima" }), rule("urutan_ambigu", { impactEvents: f.affectedEvents, impactCases: f.affectedCases })]);
    expect(handled.verdict).toBe("siap");
  });
  it("belum_layak for a tinggi finding above 5%; excluding it lowers the verdict", () => {
    const small = withSnap(seed(), { stats: { rows: 18 } });
    const d = pickChecksum(small, (r) => find(r, "nilai_hilang").percent > 5);
    const r = buildQualityReport(d, []);
    expect(r.verdict).toBe("belum_layak");
    expect(find(r, "nilai_hilang").percent).toBeGreaterThan(5);
    expect(r.reasons[0]).toMatch(/^Nilai hilang pada kolom wajib memengaruhi \d+,\d% event$/);
    const f = find(r, "nilai_hilang");
    const fixed = buildQualityReport(d, [rule("nilai_hilang", { impactEvents: f.affectedEvents, impactCases: f.affectedCases })]);
    expect(fixed.verdict).not.toBe("belum_layak");
    const accepted = buildQualityReport(d, [rule("nilai_hilang", { action: "terima", impactEvents: 0, impactCases: 0 })]);
    expect(accepted.verdict).not.toBe("belum_layak");
  });
  it("uses a decimal comma in reasons", () => {
    const r = buildQualityReport(seed(), []);
    expect(r.reasons.some((x) => /\d,\d%/.test(x) || /\d%/.test(x))).toBe(true);
    expect(r.reasons.every((x) => !/\d\.\d%/.test(x))).toBe(true);
  });
});

describe("buildCapabilities", () => {
  it("returns five rows in order", () => {
    const d = seed();
    const caps = buildCapabilities(d, buildQualityReport(d, []));
    expect(caps.map((c) => c.id)).toEqual(["waktu_mulai", "sumber_daya", "urutan", "batas_proses", "jumlah_kasus"]);
    expect(caps.every((c) => c.label.length > 0 && c.explanation.length > 0)).toBe(true);
  });
  it("waktu_mulai depends on the timestamp_start role", () => {
    const d = seed();
    expect(buildCapabilities(d, buildQualityReport(d, []))[0]).toMatchObject({ status: "terbatas", explanation: "Durasi kerja aktivitas tidak tersedia; hanya jeda antar-event dan durasi kasus" });
    const s = withMap(d, { roles: rolesWith(d, { start: "timestamp_start" }) });
    expect(buildCapabilities(s, buildQualityReport(s, []))[0].status).toBe("tersedia");
  });
  it("sumber_daya is tidak_tersedia without a resource role", () => {
    const d = seed();
    expect(buildCapabilities(d, buildQualityReport(d, []))[1].status).toBe("tersedia");
    const roles = Object.fromEntries(Object.entries(d.mapping.roles).map(([k, v]) => [k, v === "resource" ? "ignore" : v])) as Record<string, ColumnRole>;
    const n = withMap(d, { roles });
    expect(buildCapabilities(n, buildQualityReport(n, []))[1]).toMatchObject({ status: "tidak_tersedia", explanation: "Analisis beban kerja dan sumber daya tidak tersedia" });
  });
  it("urutan is terbatas above 10% of cases, otherwise tersedia", () => {
    const high = pickChecksum(seed(), (r) => find(r, "urutan_ambigu").affectedCases / r.totalCases > 0.1);
    const low = pickChecksum(seed(), (r) => find(r, "urutan_ambigu").affectedCases / r.totalCases <= 0.1);
    expect(buildCapabilities(high, buildQualityReport(high, []))[2].status).toBe("terbatas");
    expect(buildCapabilities(low, buildQualityReport(low, []))[2].status).toBe("tersedia");
    const none = withSnap(seed(), { stats: { rows: 0 } });
    expect(buildCapabilities(none, buildQualityReport(none, []))[2].status).toBe("tersedia");
  });
  it("batas_proses is always terbatas", () => {
    const d = seed();
    expect(buildCapabilities(d, buildQualityReport(d, []))[3].status).toBe("terbatas");
  });
  it("jumlah_kasus: 99 cases tidak_tersedia, 100 tersedia", () => {
    const d99 = withSnap(seed(), { stats: { rows: 594 } });
    const d100 = withSnap(seed(), { stats: { rows: 600 } });
    const r99 = buildQualityReport(d99, []);
    const r100 = buildQualityReport(d100, []);
    expect([r99.casesIncluded, r100.casesIncluded]).toEqual([99, 100]);
    expect(buildCapabilities(d99, r99)[4]).toMatchObject({ status: "tidak_tersedia", explanation: "Perbandingan kelompok dan periode dinonaktifkan" });
    expect(buildCapabilities(d100, r100)[4].status).toBe("tersedia");
  });
});

describe("datasetHash", () => {
  it("is 12 lowercase hex, stable, order independent, sensitive to ids", () => {
    const h = datasetHash("sn-1", "m-1", ["b", "a"]);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(datasetHash("sn-1", "m-1", ["a", "b"])).toBe(h);
    expect(datasetHash("sn-1", "m-1", ["a", "c"])).not.toBe(h);
    expect(datasetHash("sn-1", "m-2", ["a", "b"])).not.toBe(h);
    expect(datasetHash("sn-2", "m-1", ["a", "b"])).not.toBe(h);
    expect(datasetHash("sn-1", "m-1", [])).toMatch(/^[0-9a-f]{12}$/);
  });
  it("does not mutate its input", () => {
    const ids = ["b", "a"];
    datasetHash("x", "y", ids);
    expect(ids).toEqual(["b", "a"]);
  });
});
