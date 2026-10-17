import { describe, expect, it } from "vitest";
import { initialState, reduce, ruleVersions, rulesForProject, type MockAction } from "./reducer";
import type { MockState, RuleVersion } from "./types";

const s0 = (): MockState => structuredClone(initialState);
type Save = Extract<MockAction, { type: "saveRule" }>;
const input = (over: Partial<Save["input"]> = {}): Save["input"] => ({
  name: "Wajib Record Goods Receipt", description: "", params: { type: "wajib", activity: "Record Goods Receipt" }, scope: null,
  effectiveFrom: "2026-10-01", effectiveTo: null,
  source: { docTitle: "SOP", section: "Bagian 1", quote: "Penerimaan barang wajib dicatat." }, ...over,
});
const save = (over: Partial<Save> = {}): Save => ({ type: "saveRule", projectId: "p-p2p", input: input(), ...over });
const rule = (s: MockState, id: string) => s.rules.find((r) => r.id === id)!;
const status = (ruleId: string, to: RuleVersion["status"]): MockAction => ({ type: "changeRuleStatus", ruleId, to });

describe("saveRule: new rule", () => {
  it("creates v1 draf with a new ruleKey and exactly one audit event", () => {
    const before = s0();
    const r = reduce(before, save());
    expect(r.error).toBeUndefined();
    expect(r.state.rules.length).toBe(before.rules.length + 1);
    const created = rule(r.state, r.ruleId!);
    expect(created).toMatchObject({ projectId: "p-p2p", version: 1, status: "draf", clientConfirmed: false, createdBy: before.viewerId, name: "Wajib Record Goods Receipt" });
    expect(before.rules.some((x) => x.ruleKey === created.ruleKey)).toBe(false);
    expect(created.approvedBy).toBeUndefined();
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "aturan.simpan", objectType: "Aturan", objectLabel: "Wajib Record Goods Receipt v1", projectId: "p-p2p" });
  });
  it("returns the first validation message and keeps the same state", () => {
    const before = s0();
    const r = reduce(before, save({ input: input({ name: " " }) }));
    expect(r.error).toBe("Nama aturan wajib diisi");
    expect(r.state).toBe(before);
    expect(r.ruleId).toBeUndefined();
  });
  it("rejects an activity that is not a canonical label", () => {
    const before = s0();
    const r = reduce(before, save({ input: input({ params: { type: "wajib", activity: "Tidak Ada" } }) }));
    expect(r.error).toBe("Aktivitas tidak ada di label kanonis");
    expect(r.state).toBe(before);
  });
  it("rejects a project that is not aktif", () => {
    const before = s0();
    const r = reduce(before, save({ projectId: "p-o2c" }));
    expect(r.error).toBe("Proyek ini tidak menerima data baru");
    expect(r.state).toBe(before);
  });
  it("returns an error for an unknown project or ruleKey without throwing", () => {
    const before = s0();
    expect(reduce(before, save({ projectId: "nope" })).error).toBe("Proyek tidak ditemukan");
    expect(reduce(before, save({ ruleKey: "nope" })).error).toBe("Aturan tidak ditemukan");
    expect(reduce(before, save({ ruleKey: "nope" })).state).toBe(before);
  });
});

describe("saveRule: editing", () => {
  it("updates a draf in place (same id and version, no new record)", () => {
    const before = s0();
    const r = reduce(before, save({ ruleKey: "r-terlarang", input: input({ name: "Nama baru", params: { type: "terlarang", activity: "Record Invoice Receipt" } }) }));
    expect(r.error).toBeUndefined();
    expect(r.ruleId).toBe("r-terlarang");
    expect(r.state.rules.length).toBe(before.rules.length);
    expect(rule(r.state, "r-terlarang")).toMatchObject({ id: "r-terlarang", version: 1, status: "draf", name: "Nama baru" });
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "aturan.simpan", objectLabel: "Nama baru v1" });
  });
  it("creates a new draf version when editing a ditinjau rule", () => {
    const before = s0();
    const r = reduce(before, save({ ruleKey: "r-urutan", input: input({ name: "Urutan baru", params: { type: "urutan", before: "Record Goods Receipt", after: "Clear Invoice" } }) }));
    expect(r.error).toBeUndefined();
    expect(r.state.rules.length).toBe(before.rules.length + 1);
    const v2 = rule(r.state, r.ruleId!);
    expect(v2).toMatchObject({ ruleKey: "r-urutan", version: 2, status: "draf", clientConfirmed: false, createdBy: before.viewerId, name: "Urutan baru" });
    expect(v2.approvedBy).toBeUndefined();
    expect(v2.approvedAt).toBeUndefined();
    expect(v2.id).not.toBe("r-urutan");
    expect(rule(r.state, "r-urutan")).toBe(before.rules.find((x) => x.id === "r-urutan"));
    expect(r.state.audit[0]).toMatchObject({ action: "aturan.simpan", objectLabel: "Urutan baru v2" });
  });
  it("creates a new draf version when editing a disetujui rule, leaving the old one untouched", () => {
    const before = s0();
    const old = rule(before, "r-sla-2");
    const r = reduce(before, save({ ruleKey: "r-sla", input: input({ name: "SLA", params: { type: "sla", from: "Create Purchase Order Item", to: "Record Goods Receipt", limit: 10, unit: "kerja" } }) }));
    expect(r.error).toBeUndefined();
    expect(rule(r.state, r.ruleId!)).toMatchObject({ ruleKey: "r-sla", version: 3, status: "draf", clientConfirmed: false });
    expect(rule(r.state, "r-sla-2")).toBe(old);
    expect(rule(r.state, "r-sla-2").status).toBe("disetujui");
  });
  it("rejects editing a usang latest version", () => {
    const before = s0();
    const k = reduce(before, status("r-sla-2", "usang")).state;
    const r = reduce(k, save({ ruleKey: "r-sla", input: input() }));
    expect(r.error).toBe("Aturan usang tidak dapat diubah");
    expect(r.state).toBe(k);
  });
  it("rejects a ruleKey that belongs to another project", () => {
    const before = s0();
    const r = reduce(before, save({ projectId: "p-hr", ruleKey: "r-urutan" }));
    expect(r.error).toBeDefined();
    expect(r.state).toBe(before);
  });
  it("rejects an identical configuration with 'Tidak ada perubahan'", () => {
    const before = s0();
    const cur = rule(before, "r-urutan");
    // key order of params/source is irrelevant
    const r = reduce(before, save({ ruleKey: "r-urutan", input: {
      name: cur.name, description: cur.description, scope: cur.scope, effectiveFrom: cur.effectiveFrom, effectiveTo: cur.effectiveTo,
      params: { after: "Clear Invoice", before: "Record Goods Receipt", type: "urutan" },
      source: { quote: cur.source.quote, section: cur.source.section, docTitle: cur.source.docTitle },
    } }));
    expect(r.error).toBe("Tidak ada perubahan");
    expect(r.state).toBe(before);
  });
  it("compares against the latest version, not an older one", () => {
    const before = s0();
    // r-sla v2 is latest (kerja); v1 was kalender. Saving v1's config is a change.
    const v1 = rule(before, "r-sla-1");
    const r = reduce(before, save({ ruleKey: "r-sla", input: { ...v1, params: v1.params, scope: null } }));
    expect(r.error).toBeUndefined();
  });
});

describe("changeRuleStatus", () => {
  it("draf -> ditinjau writes aturan.ajukan", () => {
    const before = s0();
    const r = reduce(before, status("r-terlarang", "ditinjau"));
    expect(r.error).toBeUndefined();
    expect(rule(r.state, "r-terlarang").status).toBe("ditinjau");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "aturan.ajukan", objectType: "Aturan", objectLabel: `${rule(before, "r-terlarang").name} v1`, projectId: "p-p2p" });
  });
  it("ditinjau -> draf writes aturan.kembalikan", () => {
    const before = s0();
    const r = reduce(before, status("r-urutan", "draf"));
    expect(rule(r.state, "r-urutan").status).toBe("draf");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("aturan.kembalikan");
  });
  it("ditinjau -> disetujui writes aturan.setujui with approvedBy/At", () => {
    const before = s0();
    const r = reduce(before, status("r-urutan", "disetujui"));
    expect(r.error).toBeUndefined();
    expect(rule(r.state, "r-urutan")).toMatchObject({ status: "disetujui", approvedBy: before.viewerId, approvedAt: expect.any(String) });
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("aturan.setujui");
  });
  it("disetujui -> usang writes aturan.usangkan", () => {
    const before = s0();
    const r = reduce(before, status("r-sla-2", "usang"));
    expect(rule(r.state, "r-sla-2").status).toBe("usang");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0].action).toBe("aturan.usangkan");
  });
  it("rejects an illegal transition with the same state", () => {
    const before = s0();
    const r = reduce(before, status("r-terlarang", "disetujui"));
    expect(r.error).toBe("Transisi status tidak diizinkan");
    expect(r.state).toBe(before);
  });
  it("rejects approving a rule without source.quote", () => {
    const before = s0();
    rule(before, "r-urutan").source.quote = "   ";
    const r = reduce(before, status("r-urutan", "disetujui"));
    expect(r.error).toBe("Aturan tanpa rujukan sumber tidak dapat disetujui");
    expect(r.state).toBe(before);
  });
  it("rejects approving a rule whose preview is tidak_dapat_dievaluasi", () => {
    const before = s0();
    const sod = rule(before, "r-sod");
    sod.status = "ditinjau";
    before.mappings[0].roles = { case_id: "case_id", activity: "activity", timestamp: "timestamp_end" };
    const r = reduce(before, status("r-sod", "disetujui"));
    expect(r.error).toMatch(/^Aturan tidak dapat dievaluasi/);
    expect(r.state).toBe(before);
  });
  it("approving v2 makes the other disetujui version usang without a second audit", () => {
    const before = s0();
    // Fresh v3 of r-sla goes draf -> ditinjau -> disetujui; v2 (disetujui) must become usang.
    const saved = reduce(before, save({ ruleKey: "r-sla", input: input({ name: "SLA", params: { type: "sla", from: "Create Purchase Order Item", to: "Record Goods Receipt", limit: 10, unit: "kerja" } }) }));
    const v3 = saved.ruleId!;
    const rev = reduce(saved.state, status(v3, "ditinjau"));
    const appr = reduce(rev.state, status(v3, "disetujui"));
    expect(appr.error).toBeUndefined();
    expect(appr.state.audit.length).toBe(rev.state.audit.length + 1);
    expect(rule(appr.state, "r-sla-2").status).toBe("usang");
    expect(rule(appr.state, "r-sla-1").status).toBe("usang");
    expect(appr.state.rules.filter((x) => x.ruleKey === "r-sla" && x.status === "disetujui").map((x) => x.id)).toEqual([v3]);
  });
  it("rejects moving to ditinjau when the stored input no longer validates", () => {
    const before = s0();
    rule(before, "r-terlarang").params = { type: "terlarang", activity: "Aktivitas Hilang" };
    const r = reduce(before, status("r-terlarang", "ditinjau"));
    expect(r.error).toBe("Aktivitas tidak ada di label kanonis");
    expect(r.state).toBe(before);
  });
  it("rejects when the project is not aktif or the rule is unknown", () => {
    const before = s0();
    before.rules.push({ ...rule(before, "r-terlarang"), id: "r-x", ruleKey: "r-x", projectId: "p-o2c" });
    const a = reduce(before, status("r-x", "ditinjau"));
    expect(a.error).toBe("Proyek ini tidak menerima data baru");
    expect(a.state).toBe(before);
    const b = reduce(before, status("nope", "ditinjau"));
    expect(b.error).toBe("Aturan tidak ditemukan");
    expect(b.state).toBe(before);
  });
});

describe("confirmRuleClient", () => {
  const confirm = (ruleId: string): MockAction => ({ type: "confirmRuleClient", ruleId });
  it("confirms a ditinjau rule with one audit event", () => {
    const before = s0();
    const r = reduce(before, confirm("r-urutan"));
    expect(r.error).toBeUndefined();
    expect(rule(r.state, "r-urutan").clientConfirmed).toBe(true);
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "aturan.konfirmasi_klien", objectType: "Aturan", projectId: "p-p2p" });
  });
  it("confirms a disetujui rule that is not yet confirmed", () => {
    const before = s0();
    rule(before, "r-sla-2").clientConfirmed = false;
    const r = reduce(before, confirm("r-sla-2"));
    expect(rule(r.state, "r-sla-2").clientConfirmed).toBe(true);
  });
  it("rejects draf, already confirmed, usang, non-aktif project and unknown ids", () => {
    const before = s0();
    expect(reduce(before, confirm("r-terlarang")).error).toBeDefined();
    expect(reduce(before, confirm("r-sla-2")).error).toBeDefined(); // seed v2 already confirmed
    expect(reduce(before, confirm("r-sla-1")).error).toBeDefined();
    expect(reduce(before, confirm("nope")).error).toBe("Aturan tidak ditemukan");
    for (const id of ["r-terlarang", "r-sla-2", "r-sla-1", "nope"]) expect(reduce(before, confirm(id)).state).toBe(before);
    before.rules.push({ ...rule(before, "r-urutan"), id: "r-x", ruleKey: "r-x", projectId: "p-o2c" });
    const r = reduce(before, confirm("r-x"));
    expect(r.error).toBe("Proyek ini tidak menerima data baru");
    expect(r.state).toBe(before);
  });
});

describe("rulesForProject / ruleVersions", () => {
  it("lists every version of a project's rules", () => {
    const s = s0();
    expect(rulesForProject(s, "p-p2p").map((r) => r.id).sort()).toEqual(s.rules.map((r) => r.id).sort());
    expect(rulesForProject(s, "p-hr")).toEqual([]);
  });
  it("orders versions newest first, ties by later index", () => {
    const s = s0();
    const base = s.rules[0];
    s.rules = [
      { ...base, id: "a", ruleKey: "k", version: 1 }, { ...base, id: "b", ruleKey: "k", version: 3 },
      { ...base, id: "c", ruleKey: "k", version: 2 }, { ...base, id: "d", ruleKey: "k", version: 3 }, { ...base, id: "x", ruleKey: "other", version: 9 },
    ];
    expect(ruleVersions(s, "k").map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
    expect(ruleVersions(s, "nope")).toEqual([]);
  });
});
