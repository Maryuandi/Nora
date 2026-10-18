import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { buildCapabilities, buildQualityReport, datasetHash, qualityDataset, repairImpact } from "./quality";
import { datasetVersionsForSource, latestDataset, reduce, repairRulesForSource, type MockAction } from "./reducer";
import type { DatasetVersion, MockState, RepairRule } from "./types";

const SRC = "s-p2p-sap";
const s0 = (): MockState => structuredClone(initialState);
type Add = Extract<MockAction, { type: "addRepairRule" }>;
const add = (over: Partial<Add> = {}): Add => ({ type: "addRepairRule", sourceId: SRC, check: "nilai_hilang", action: "kecualikan_event", reason: "data uji", ...over });
const publish = (note?: string): MockAction => ({ type: "publishDataset", sourceId: SRC, ...(note ? { note } : {}) });
const inactive = (): MockState => {
  const s = s0();
  s.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan";
  return s;
};
const report = (s: MockState) => buildQualityReport(qualityDataset(s, SRC)!, s.repairRules.filter((r) => r.sourceId === SRC && r.active));
const rule = (over: Partial<RepairRule> = {}): RepairRule => ({
  id: "rp-x", sourceId: SRC, projectId: "p-p2p", check: "nilai_hilang", action: "kecualikan_event", reason: "uji",
  impactEvents: 10, impactCases: 2, active: true, createdBy: "u-dimas", createdAt: "2026-10-18T00:00:00Z", ...over,
});
const ds = (over: Partial<DatasetVersion>): DatasetVersion => ({
  id: "ds-x", sourceId: SRC, projectId: "p-p2p", version: 1, snapshotId: "sn-1", mappingId: "m-1", repairRuleIds: [], hash: "h",
  verdict: "siap", eventsIncluded: 1, casesIncluded: 1, capabilities: [], createdBy: "u-dimas", createdAt: "2026-10-18T09:30:00Z", ...over,
});
// Deterministic search over sn-1 checksums so the blocking verdict is real, not assumed.
function belumLayak(): MockState {
  for (let i = 0; i < 20000; i++) {
    const s = s0();
    s.snapshots.find((x) => x.id === "sn-1")!.checksum = `cs${i}`;
    if (report(s).verdict === "belum_layak") return s;
  }
  throw new Error("no checksum gives belum_layak");
}

describe("addRepairRule: success", () => {
  it("adds an active rule with computed impact and exactly one audit event", () => {
    const before = s0();
    const r = reduce(before, add());
    expect(r.error).toBeUndefined();
    const impact = repairImpact(report(before), "nilai_hilang");
    expect(impact.events).toBeGreaterThan(0);
    expect(r.state.repairRules.length).toBe(before.repairRules.length + 1);
    const rp = r.state.repairRules.find((x) => x.id === r.repairRuleId)!;
    expect(rp).toMatchObject({
      sourceId: SRC, projectId: "p-p2p", check: "nilai_hilang", action: "kecualikan_event", reason: "data uji",
      impactEvents: impact.events, impactCases: impact.cases, active: true, createdBy: before.viewerId,
    });
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({
      action: "perbaikan.tambah", objectType: "Perbaikan", objectLabel: "Nilai hilang pada kolom wajib (Kecualikan event)", projectId: "p-p2p",
    });
  });
  it("trims the reason; terima has zero impact", () => {
    const r = reduce(s0(), add({ action: "terima", reason: "  sudah dibahas  " }));
    expect(r.error).toBeUndefined();
    expect(r.state.repairRules.find((x) => x.id === r.repairRuleId)).toMatchObject({ reason: "sudah dibahas", impactEvents: 0, impactCases: 0 });
    expect(r.state.audit[0].objectLabel).toBe("Nilai hilang pada kolom wajib (Terima apa adanya)");
  });
  it("accepts terima on an unknown finding with zero impact", () => {
    const r = reduce(s0(), add({ check: "kasus_belum_selesai", action: "terima" }));
    expect(r.error).toBeUndefined();
    expect(r.state.repairRules.find((x) => x.id === r.repairRuleId)).toMatchObject({ check: "kasus_belum_selesai", impactEvents: 0, impactCases: 0 });
  });
});

describe("addRepairRule: guards", () => {
  const bad = (state: MockState, a: MockAction, msg: string) => {
    const r = reduce(state, a);
    expect(r.error).toBe(msg);
    expect(r.state).toBe(state);
  };
  it("unknown source", () => bad(s0(), add({ sourceId: "nope" }), "Sumber tidak ditemukan"));
  it("inactive project", () => bad(inactive(), add(), "Proyek ini tidak menerima perubahan"));
  it("source without ready data", () => {
    const s = s0();
    s.sources.push({ ...s.sources.find((x) => x.id === SRC)!, id: "s-kosong", name: "Kosong" });
    bad(s, add({ sourceId: "s-kosong" }), "Belum ada data yang siap dinilai");
    bad(s0(), add({ sourceId: "s-p2p-tiket" }), "Belum ada data yang siap dinilai");
  });
  it("blank reason", () => bad(s0(), add({ reason: "   " }), "Alasan wajib diisi"));
  it("clean finding", () => bad(s0(), add({ check: "duplikasi" }), "Tidak ada masalah untuk ditangani"));
  it("not applicable finding", () => bad(s0(), add({ check: "waktu_mulai_selesai", action: "terima" }), "Tidak ada masalah untuk ditangani"));
  it("exclusion on an unknown finding", () => {
    bad(s0(), add({ check: "kasus_belum_selesai", action: "kecualikan_event" }), "Aksi pengecualian tidak berlaku untuk temuan yang belum diketahui");
    bad(s0(), add({ check: "kasus_belum_selesai", action: "kecualikan_kasus" }), "Aksi pengecualian tidak berlaku untuk temuan yang belum diketahui");
  });
  it("duplicate active rule for the same check", () => {
    const r1 = reduce(s0(), add());
    bad(r1.state, add({ action: "terima" }), "Sudah ada aturan perbaikan aktif untuk pemeriksaan ini");
  });
  it("never throws on unknown ids", () => {
    expect(() => reduce(s0(), { type: "revokeRepairRule", ruleId: "nope" })).not.toThrow();
    expect(() => reduce(s0(), { type: "publishDataset", sourceId: "nope" })).not.toThrow();
  });
});

describe("addRepairRule: large exclusion (> 20% of events)", () => {
  const total = 57_195;
  const impact = (s: MockState, check: Add["check"]) => repairImpact(report(s), check).events;
  it("rejects without confirmLarge and accepts with it", () => {
    const before = s0();
    expect(impact(before, "di_luar_periode") * 5).toBeGreaterThan(total);
    const r = reduce(before, add({ check: "di_luar_periode" }));
    expect(r.error).toBe("Aturan ini mengecualikan lebih dari 20% event; konfirmasi tambahan diperlukan");
    expect(r.state).toBe(before);
    const ok = reduce(before, add({ check: "di_luar_periode", confirmLarge: true }));
    expect(ok.error).toBeUndefined();
    expect(ok.state.repairRules.at(-1)).toMatchObject({ check: "di_luar_periode", impactEvents: impact(before, "di_luar_periode") });
  });
  it("counts existing active rules of this source toward the 20%", () => {
    // waktu_tidak_wajar adds 712 events; an existing rule of 10_727 makes exactly 11_439 = 20%.
    const withRule = (events: number) => {
      const s = s0();
      s.repairRules.push(rule({ check: "urutan_ambigu", impactEvents: events }));
      return s;
    };
    expect(impact(s0(), "waktu_tidak_wajar")).toBe(712);
    const exact = withRule(0.2 * total - 712);
    expect(reduce(exact, add({ check: "waktu_tidak_wajar" })).error).toBeUndefined();
    const over = withRule(0.2 * total - 712 + 1);
    expect(reduce(over, add({ check: "waktu_tidak_wajar" })).error).toBe("Aturan ini mengecualikan lebih dari 20% event; konfirmasi tambahan diperlukan");
    expect(reduce(over, add({ check: "waktu_tidak_wajar", confirmLarge: true })).error).toBeUndefined();
  });
  it("terima never needs confirmation, even over 20%", () => {
    const s = s0();
    s.repairRules.push(rule({ check: "urutan_ambigu", impactEvents: 20_000 }));
    expect(reduce(s, add({ check: "waktu_tidak_wajar", action: "terima" })).error).toBeUndefined();
  });
  it("ignores rules of another source and revoked rules", () => {
    const s = s0();
    s.repairRules.push(rule({ id: "rp-o", sourceId: "s-o2c-erp", projectId: "p-o2c", check: "urutan_ambigu", impactEvents: 50_000 }));
    s.repairRules.push(rule({ id: "rp-r", check: "urutan_ambigu", impactEvents: 50_000, active: false }));
    const r = reduce(s, add({ check: "waktu_tidak_wajar" }));
    expect(r.error).toBeUndefined();
    expect(report(s).excludedEvents).toBe(0);
  });
  it("another source's active rule for the same check does not block adding", () => {
    const s = s0();
    s.repairRules.push(rule({ id: "rp-o", sourceId: "s-o2c-erp", projectId: "p-o2c", check: "nilai_hilang" }));
    expect(reduce(s, add()).error).toBeUndefined();
  });
});

describe("revokeRepairRule", () => {
  const withRule = () => reduce(s0(), add());
  it("deactivates the rule with revoked fields and one audit event", () => {
    const { state, repairRuleId } = withRule();
    const r = reduce(state, { type: "revokeRepairRule", ruleId: repairRuleId! });
    expect(r.error).toBeUndefined();
    expect(r.state.repairRules.find((x) => x.id === repairRuleId)).toMatchObject({ active: false, revokedBy: state.viewerId, revokedAt: expect.any(String) });
    expect(r.state.audit.length).toBe(state.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "perbaikan.cabut", objectType: "Perbaikan", objectLabel: "Nilai hilang pada kolom wajib (Kecualikan event)", projectId: "p-p2p" });
  });
  it("rejects unknown rules, double revocation and inactive projects with the same state reference", () => {
    const { state, repairRuleId } = withRule();
    const unknown = reduce(state, { type: "revokeRepairRule", ruleId: "nope" });
    expect(unknown.error).toBe("Aturan tidak ditemukan");
    expect(unknown.state).toBe(state);
    const revoked = reduce(state, { type: "revokeRepairRule", ruleId: repairRuleId! }).state;
    const twice = reduce(revoked, { type: "revokeRepairRule", ruleId: repairRuleId! });
    expect(twice.error).toBe("Aturan sudah dicabut");
    expect(twice.state).toBe(revoked);
    const frozen = structuredClone(state);
    frozen.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan";
    const blocked = reduce(frozen, { type: "revokeRepairRule", ruleId: repairRuleId! });
    expect(blocked.error).toBe("Proyek ini tidak menerima perubahan");
    expect(blocked.state).toBe(frozen);
  });
  it("revoke then re-add for the same check works and only the new rule counts", () => {
    const first = withRule();
    const revoked = reduce(first.state, { type: "revokeRepairRule", ruleId: first.repairRuleId! }).state;
    expect(report(revoked).excludedEvents).toBe(0);
    const again = reduce(revoked, add({ action: "kecualikan_kasus", reason: "ulang" }));
    expect(again.error).toBeUndefined();
    expect(again.repairRuleId).not.toBe(first.repairRuleId);
    const r = report(again.state);
    const impact = repairImpact(report(s0()), "nilai_hilang");
    expect(r.excludedEvents).toBe(impact.events);
    expect(repairRulesForSource(again.state, SRC, true).map((x) => x.id)).toEqual([again.repairRuleId]);
    expect(repairRulesForSource(again.state, SRC).length).toBe(2);
  });
});

describe("publishDataset", () => {
  it("publishes v1 with deterministic hash, active rules only, capabilities and one audit event", () => {
    const withRules = reduce(s0(), add({ action: "terima" }));
    const revokedOne = reduce(withRules.state, add({ check: "waktu_tidak_wajar" }));
    const before = reduce(revokedOne.state, { type: "revokeRepairRule", ruleId: revokedOne.repairRuleId! }).state;
    const r = reduce(before, publish("  rilis awal  "));
    expect(r.error).toBeUndefined();
    const d = r.state.datasetVersions.find((x) => x.id === r.datasetId)!;
    const rep = report(before);
    expect(d).toMatchObject({
      sourceId: SRC, projectId: "p-p2p", version: 1, snapshotId: "sn-1", mappingId: "m-1", repairRuleIds: [withRules.repairRuleId],
      verdict: rep.verdict, eventsIncluded: rep.eventsIncluded, casesIncluded: rep.casesIncluded, note: "rilis awal", createdBy: before.viewerId,
    });
    expect(d.hash).toBe(datasetHash("sn-1", "m-1", [withRules.repairRuleId!]));
    expect(d.capabilities).toEqual(buildCapabilities(qualityDataset(before, SRC)!, rep));
    expect(d.capabilities.length).toBe(5);
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "dataset.terbit", objectType: "Dataset", objectLabel: "Ekspor SAP P2P v1", projectId: "p-p2p" });
  });
  it("omits the note when blank and sorts repairRuleIds", () => {
    const s = s0();
    s.repairRules.push(rule({ id: "rp-b", check: "waktu_tidak_wajar", impactEvents: 5 }), rule({ id: "rp-a", check: "nilai_hilang" }));
    const d = (x: MockState, r: ReturnType<typeof reduce>) => x.datasetVersions.find((v) => v.id === r.datasetId)!;
    const r = reduce(s, publish("   "));
    expect(r.error).toBeUndefined();
    expect(d(r.state, r).repairRuleIds).toEqual(["rp-a", "rp-b"]);
    expect("note" in d(r.state, r)).toBe(false);
  });
  it("rejects an identical republish with the same state reference", () => {
    const v1 = reduce(s0(), publish()).state;
    const r = reduce(v1, publish());
    expect(r.error).toBe("Tidak ada perubahan dari v1");
    expect(r.state).toBe(v1);
  });
  it("publishes v2 with a different hash after the rules change", () => {
    const v1 = reduce(s0(), publish()).state;
    const withRule = reduce(v1, add());
    const v2 = reduce(withRule.state, publish());
    expect(v2.error).toBeUndefined();
    const [n2, n1] = datasetVersionsForSource(v2.state, SRC);
    expect(n2.version).toBe(2);
    expect(n2.hash).not.toBe(n1.hash);
    expect(n2.repairRuleIds).toEqual([withRule.repairRuleId]);
    // Revoking returns to the v1 configuration, which is not the latest hash, so it publishes as v3.
    const back = reduce(reduce(v2.state, { type: "revokeRepairRule", ruleId: withRule.repairRuleId! }).state, publish());
    expect(back.error).toBeUndefined();
    expect(latestDataset(back.state, SRC)).toMatchObject({ version: 3, hash: n1.hash });
  });
  it("ignores rules of another source for the hash and report", () => {
    const v1 = reduce(s0(), publish());
    const other = s0();
    other.repairRules.push(rule({ id: "rp-o", sourceId: "s-o2c-erp", projectId: "p-o2c" }));
    const r = reduce(other, publish());
    expect(r.state.datasetVersions.at(-1)!.hash).toBe(v1.state.datasetVersions.at(-1)!.hash);
    expect(r.state.datasetVersions.at(-1)!.repairRuleIds).toEqual([]);
    expect(r.state.datasetVersions.at(-1)!.eventsIncluded).toBe(report(s0()).eventsIncluded);
    // A new dataset on this source is also unaffected by the other source's version history.
    const withOtherDs = s0();
    withOtherDs.datasetVersions.push(ds({ sourceId: "s-o2c-erp", projectId: "p-o2c", hash: v1.state.datasetVersions.at(-1)!.hash }));
    expect(reduce(withOtherDs, publish()).state.datasetVersions.at(-1)!.version).toBe(1);
  });
  it("blocks belum_layak with the first reason", () => {
    const s = belumLayak();
    const rep = report(s);
    expect(rep.verdict).toBe("belum_layak");
    const r = reduce(s, publish());
    expect(r.error).toBe(`Data belum layak diterbitkan: ${rep.reasons[0]}`);
    expect(r.error).toMatch(/^Data belum layak diterbitkan: .+/);
    expect(r.state).toBe(s);
  });
  it("rejects unknown source, inactive project and source without data", () => {
    const s = s0();
    expect(reduce(s, { type: "publishDataset", sourceId: "nope" })).toEqual({ state: s, error: "Sumber tidak ditemukan" });
    const frozen = inactive();
    const f = reduce(frozen, publish());
    expect(f.error).toBe("Proyek ini tidak menerima perubahan");
    expect(f.state).toBe(frozen);
    const none = reduce(s, { type: "publishDataset", sourceId: "s-p2p-tiket" });
    expect(none.error).toBe("Belum ada data yang siap dinilai");
    expect(none.state).toBe(s);
  });
});

describe("helpers", () => {
  it("repairRulesForSource: newest first, ties by later index, active filter, source filter", () => {
    const s = s0();
    s.repairRules.push(
      rule({ id: "a", createdAt: "2026-10-18T00:00:00Z" }), rule({ id: "b", createdAt: "2026-10-19T00:00:00Z", active: false }),
      rule({ id: "c", createdAt: "2026-10-18T00:00:00Z" }), rule({ id: "o", sourceId: "s-o2c-erp" }),
    );
    expect(repairRulesForSource(s, SRC).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(repairRulesForSource(s, SRC, true).map((x) => x.id)).toEqual(["c", "a"]);
    expect(repairRulesForSource(s, "none")).toEqual([]);
  });
  it("datasetVersionsForSource: newest first by version, ties by later index; latestDataset", () => {
    const s = s0();
    expect(latestDataset(s, SRC)).toBeNull();
    s.datasetVersions.push(ds({ id: "d1", version: 1 }), ds({ id: "d3", version: 3 }), ds({ id: "d3b", version: 3 }), ds({ id: "d2", version: 2 }), ds({ id: "o", sourceId: "s-o2c-erp", version: 9 }));
    expect(datasetVersionsForSource(s, SRC).map((x) => x.id)).toEqual(["d3b", "d3", "d2", "d1"]);
    expect(latestDataset(s, SRC)!.id).toBe("d3b");
  });
});
