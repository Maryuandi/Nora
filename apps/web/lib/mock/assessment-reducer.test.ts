import { describe, expect, it } from "vitest";
import { effective } from "./assessment";
import { activeSpec, isStale } from "./specs";
import { initialState, reduce, type MockAction } from "./reducer";
import type { MockState } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const run = (findingId: string, scope: "belum_dinilai" | "semua"): MockAction => ({ type: "runAssessment", projectId: "p-p2p", findingId, scope });
const correct = (assessmentId: string, over: Partial<Extract<MockAction, { type: "correctAssessment" }>> = {}): MockAction =>
  ({ type: "correctAssessment", assessmentId, relevance: "tidak_relevan", reason: "Bukti tidak mendukung", addToGoldSet: false, ...over });
const confirm = (assessmentId: string): MockAction => ({ type: "confirmAssessment", assessmentId });
const aid = (s: MockState, cand: string) => s.assessments.find((a) => a.candidateId === cand && !a.supersededBy)!.id;
const count = (s: MockState, action: string) => s.audit.filter((e) => e.action === action).length;

describe("runAssessment with a relevansi spec", () => {
  it("uses the active spec version and thresholds for new results", () => {
    const b = s0();
    const spec = activeSpec(b, "p-p2p", "relevansi")!;
    const saved = reduce(b, { type: "saveSpec", projectId: "p-p2p", task: "relevansi", question: spec.question, categories: [], thresholds: { ...spec.thresholds, sufficient: 0.95 } });
    expect(saved.error).toBeUndefined();
    const r = reduce(saved.state, run("f-bottleneck", "semua"));
    const fresh = r.state.assessments.filter((a) => a.findingId === "f-bottleneck" && !a.supersededBy);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((a) => a.specVersion === 2)).toBe(true);
    expect(fresh.filter((a) => a.status !== "gagal").every((a) => a.status === "informasi_tidak_cukup")).toBe(true);
    expect(fresh.some((a) => isStale(a.specVersion, r.state, "p-p2p", "relevansi"))).toBe(false);
  });
});

describe("runAssessment", () => {
  it("belum_dinilai scores only the unscored candidate, once", () => {
    const before = s0();
    const r = reduce(before, run("f-rework", "belum_dinilai"));
    expect(r.error).toBeUndefined();
    expect(r.state.assessments.length).toBe(before.assessments.length + 1);
    const n = r.state.assessments.find((a) => a.candidateId === "c9")!;
    expect(n.status).toBe("otomatis");
    expect(count(r.state, "penilaian.jalankan")).toBe(count(before, "penilaian.jalankan") + 1);
    expect(r.state.audit[0]).toMatchObject({ objectType: "Penilaian", objectLabel: before.assessFindings.find((f) => f.id === "f-rework")!.title });
    const again = reduce(r.state, run("f-rework", "belum_dinilai"));
    expect(again.error).toBe("Semua kandidat sudah dinilai");
    expect(again.state).toBe(r.state);
  });
  it("semua supersedes previous current results and keeps old corrections", () => {
    const b = s0();
    const old = aid(b, "c3");
    const withCorr = reduce(b, correct(old)).state;
    const r = reduce(withCorr, run("f-bottleneck", "semua"));
    expect(r.error).toBeUndefined();
    const oldA = r.state.assessments.find((a) => a.id === old)!;
    const fresh = r.state.assessments.find((a) => a.id === oldA.supersededBy)!;
    expect(fresh.candidateId).toBe("c3");
    expect(r.state.corrections.filter((c) => c.assessmentId === old).length).toBe(1);
    expect(r.state.assessments.some((a) => a.candidateId === "c6")).toBe(false);
  });
});

describe("correctAssessment", () => {
  it("adds a correction without touching assessments", () => {
    const b = s0();
    const r = reduce(b, correct(aid(b, "c3")));
    expect(r.error).toBeUndefined();
    expect(r.state.corrections.length).toBe(b.corrections.length + 1);
    expect(r.state.assessments).toBe(b.assessments);
    expect(r.state.corrections.at(-1)!.confirmedOnly).toBe(false);
    expect(r.state.audit[0].action).toBe("penilaian.koreksi");
  });
  it("addToGoldSet creates or updates the relevance gold item with one audit event", () => {
    const b = s0();
    const r = reduce(b, correct(aid(b, "c3"), { addToGoldSet: true, relevance: "tidak_relevan" }));
    expect(r.state.goldItems.length).toBe(b.goldItems.length);
    expect(r.state.goldItems.find((g) => g.itemRef === "f-bottleneck:c3")!.label).toBe("tidak_relevan");
    expect(r.state.audit.length).toBe(b.audit.length + 1);
    expect(r.state.audit[0].action).toBe("penilaian.koreksi");
    const g = { ...b, goldItems: b.goldItems.filter((x) => x.itemRef !== "f-bottleneck:c3") };
    const created = reduce(g, correct(aid(g, "c3"), { addToGoldSet: true }));
    expect(created.state.goldItems.length).toBe(g.goldItems.length + 1);
    expect(created.state.goldItems.at(-1)).toMatchObject({ id: "g-relevansi-f-bottleneck-c3", task: "relevansi", label: "tidak_relevan", labeler: "u-dimas" });
    expect(created.state.audit.length).toBe(g.audit.length + 1);
  });
  it("validates the reason", () => {
    const b = s0();
    expect(reduce(b, correct(aid(b, "c3"), { reason: "   " })).error).toBe("Alasan wajib diisi");
    const long = reduce(b, correct(aid(b, "c3"), { reason: "x".repeat(501) }));
    expect(long.error).toBe("Alasan maksimal 500 karakter");
    expect(long.state).toBe(b);
  });
  it("uses the latest of two corrections", () => {
    const b = s0();
    const id = aid(b, "c3");
    const s1 = reduce(b, correct(id, { relevance: "tidak_relevan" })).state;
    const s2 = reduce(s1, correct(id, { relevance: "sebagian_relevan" })).state;
    expect(effective(s2.assessments.find((a) => a.id === id)!, s2.corrections).relevance).toBe("sebagian_relevan");
  });
});

describe("confirmAssessment", () => {
  it("confirms an automatic result", () => {
    const b = s0();
    const r = reduce(b, confirm(aid(b, "c1")));
    expect(r.error).toBeUndefined();
    expect(r.state.corrections.at(-1)).toMatchObject({ confirmedOnly: true, relevance: "relevan" });
    expect(r.state.audit[0].action).toBe("penilaian.konfirmasi");
  });
  it("rejects insufficient-information results", () => {
    const b = s0();
    expect(reduce(b, confirm(aid(b, "c5"))).error).toBe("Hanya hasil otomatis atau perlu review yang dapat dikonfirmasi");
  });
  it("rejects superseded results for confirm and correct", () => {
    const b = s0();
    const old = aid(b, "c1");
    const s1 = reduce(b, run("f-bottleneck", "semua")).state;
    expect(reduce(s1, confirm(old)).error).toBe("Hasil ini sudah digantikan penilaian baru");
    expect(reduce(s1, correct(old)).error).toBe("Hasil ini sudah digantikan penilaian baru");
  });
});

describe("permissions and project status", () => {
  it.each(["u-sari", "u-rina"])("%s is refused on every action", (u) => {
    const b = { ...s0(), viewerId: u };
    for (const a of [run("f-rework", "belum_dinilai"), correct(aid(b, "c3")), confirm(aid(b, "c1"))]) {
      const r = reduce(b, a);
      expect(r.error).toBe("Anda tidak berwenang melakukan aksi ini");
      expect(r.state).toBe(b);
    }
  });
  it("refuses when the project is not aktif", () => {
    const b = s0();
    b.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan";
    for (const a of [run("f-rework", "belum_dinilai"), correct(aid(b, "c3")), confirm(aid(b, "c1"))])
      expect(reduce(b, a).error).toBe("Proyek ini tidak menerima data baru");
  });
  it("reports missing entities", () => {
    const b = s0();
    expect(reduce(b, run("nope", "semua")).error).toBe("Temuan tidak ditemukan");
    expect(reduce(b, confirm("nope")).error).toBe("Hasil penilaian tidak ditemukan");
  });
});
