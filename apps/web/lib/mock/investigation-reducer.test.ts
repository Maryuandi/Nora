import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { reduce, type MockAction } from "./reducer";
import { linkFreshness } from "./investigation";
import type { MockState } from "./types";

const s0 = () => structuredClone(initialState);
const as = (s: MockState, userId: string) => reduce(s, { type: "setViewer", userId }).state;
const P = "p-p2p";
const create = (s: MockState, over: Partial<Extract<MockAction, { type: "createInvestigation" }>> = {}) =>
  reduce(s, { type: "createInvestigation", projectId: P, title: "Judul baru", question: "Apa penyebabnya?", findingId: "finding_42", ...over });
const audits = (before: MockState, after: MockState) => after.audit.slice(0, after.audit.length - before.audit.length);

describe("createInvestigation", () => {
  it("dari temuan: terbuka, pemilik viewer, anggota viewer + pemilik proses, tautan otomatis, satu audit", () => {
    const s = s0();
    const r = create(s);
    expect(r.error).toBeUndefined();
    const inv = r.state.investigations.find((i) => i.id === r.investigationId)!;
    expect(inv).toMatchObject({ projectId: P, status: "terbuka", ownerId: "u-dimas", originFindingId: "finding_42" });
    expect(inv.memberIds).toEqual(expect.arrayContaining(["u-dimas", "u-sari"]));
    const links = r.state.links.filter((l) => l.investigationId === inv.id);
    const pairs = links.map((l) => `${l.kind}:${l.targetId}`);
    expect(pairs).toEqual(expect.arrayContaining(["temuan:finding_42", "aturan:r-sla", "kandidat:cand_1", "kandidat:cand_2", "hasil_jev:jev_42", "interpretasi:i-seed-42"]));
    expect(links.find((l) => l.kind === "aturan")!.linkedVersion).toBe("v2");
    expect(links.find((l) => l.kind === "temuan")!.linkedVersion).toBe("analisis-3");
    const a = audits(s, r.state);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ action: "investigasi.buat", objectType: "Investigasi", projectId: P });
  });
  it("kosong: tanpa tautan", () => {
    const r = create(s0(), { findingId: undefined });
    expect(r.error).toBeUndefined();
    expect(r.state.links.filter((l) => l.investigationId === r.investigationId)).toHaveLength(0);
  });
  it("judul atau pertanyaan kosong -> galat", () => {
    const s = s0();
    expect(create(s, { title: " " })).toEqual({ state: s, error: expect.any(String) });
    expect(create(s, { question: "  " }).state).toBe(s);
  });
  it("temuan milik proyek lain -> galat", () => {
    const s = s0();
    s.findings.push({ id: "f-lain", projectId: "p-lain", title: "x", summary: "", limitedContext: false, evidence: [] });
    const r = create(s, { findingId: "f-lain" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
});

describe("linkObject / unlinkObject", () => {
  it("sukses menautkan dan mengaudit; ganda dan target tak ada ditolak", () => {
    const s = s0();
    const r = reduce(s, { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" });
    expect(r.error).toBeUndefined();
    expect(r.state.links.find((l) => l.id === r.linkId)).toMatchObject({ investigationId: "inv-1", kind: "kasus", targetId: "case_sample", linkedVersion: "analisis-3" });
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.tautkan"]);
    const dup = reduce(r.state, { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" });
    expect(dup.error).toBeDefined();
    expect(dup.state).toBe(r.state);
    const miss = reduce(s, { type: "linkObject", investigationId: "inv-1", kind: "kandidat", targetId: "nope" });
    expect(miss.error).toBeDefined();
    expect(miss.state).toBe(s);
  });
  it("unlink: ditolak bila tautan punya keputusan; sukses bila tidak", () => {
    const s = s0();
    const blocked = reduce(s, { type: "unlinkObject", linkId: "ln-2-2" });
    expect(blocked.error).toBeDefined();
    expect(blocked.state).toBe(s);
    const ok = reduce(s, { type: "unlinkObject", linkId: "ln-1-4" });
    expect(ok.error).toBeUndefined();
    expect(ok.state.links.some((l) => l.id === "ln-1-4")).toBe(false);
    expect(audits(s, ok.state).map((e) => e.action)).toEqual(["investigasi.lepas"]);
  });
});

describe("refreshLink", () => {
  it("linkedVersion menjadi versi kini", () => {
    const s = s0();
    s.analysisStates[0].analysis = "analisis-4";
    s.analysisStates[0].ruleVersions["r-sla"] = "v3";
    const r = reduce(s, { type: "refreshLink", linkId: "ln-1-2" });
    expect(r.error).toBeUndefined();
    const l = r.state.links.find((x) => x.id === "ln-1-2")!;
    expect(l.linkedVersion).toBe("v3");
    expect(linkFreshness(r.state, l).stale).toBe(false);
    const t = reduce(r.state, { type: "refreshLink", linkId: "ln-1-1" });
    expect(t.state.links.find((x) => x.id === "ln-1-1")!.linkedVersion).toBe("analisis-4");
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.perbarui_tautan"]);
  });
});

describe("setInvestigationStatus", () => {
  it("siap_diputuskan ditolak selagi ada keluaran belum ditinjau, state identik", () => {
    const s = s0();
    const r = reduce(s, { type: "setInvestigationStatus", investigationId: "inv-1", to: "siap_diputuskan" });
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("sukses setelah semua ditinjau, satu audit", () => {
    const s = s0();
    for (const linkId of ["ln-1-5", "ln-1-6"])
      s.reviews.push({ id: `rv-${linkId}`, investigationId: "inv-1", linkId, outcome: "dikonfirmasi", reason: "", forEvalSet: false, by: "u-dimas", at: "2026-10-17" });
    const r = reduce(s, { type: "setInvestigationStatus", investigationId: "inv-1", to: "siap_diputuskan" });
    expect(r.error).toBeUndefined();
    expect(r.state.investigations.find((i) => i.id === "inv-1")!.status).toBe("siap_diputuskan");
    expect(audits(s, r.state).map((e) => e.action)).toEqual(["investigasi.status"]);
  });
});

describe("penolakan umum", () => {
  const actions: [string, MockAction][] = [
    ["createInvestigation", { type: "createInvestigation", projectId: P, title: "T", question: "Q" }],
    ["linkObject", { type: "linkObject", investigationId: "inv-1", kind: "kasus", targetId: "case_sample" }],
    ["setInvestigationStatus", { type: "setInvestigationStatus", investigationId: "inv-1", to: "menunggu_informasi" }],
  ];
  it.each(actions)("%s: pemilik proses ditolak", (_n, a) => {
    const s = as(s0(), "u-sari");
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each(actions)("%s: administrator ditolak", (_n, a) => {
    const s = as(s0(), "u-rina");
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each(actions)("%s: proyek ditangguhkan ditolak", (_n, a) => {
    const s = s0();
    s.projects.find((p) => p.id === P)!.status = "ditangguhkan";
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it.each([
    { type: "createInvestigation", projectId: "x", title: "T", question: "Q" },
    { type: "linkObject", investigationId: "x", kind: "kasus", targetId: "case_sample" },
    { type: "unlinkObject", linkId: "x" },
    { type: "refreshLink", linkId: "x" },
    { type: "setInvestigationStatus", investigationId: "x", to: "selesai" },
  ] as MockAction[])("id tak dikenal tidak melempar: %o", (a) => {
    const s = s0();
    const r = reduce(s, a);
    expect(r.error).toBeDefined();
    expect(r.state).toBe(s);
  });
  it("aksi M11 yang belum diimplementasi mengembalikan galat, bukan diam-diam", () => {
    const s = s0();
    const r = reduce(s, { type: "markNotificationsRead" });
    expect(r).toEqual({ state: s, error: "Belum didukung" });
  });
});
