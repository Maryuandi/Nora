import { describe, expect, it } from "vitest";
import { effectiveClass } from "./classification";
import { initialState, reduce, type MockAction } from "./reducer";
import { activeSpec } from "./specs";
import type { MockState, TaskKind, Thresholds } from "./types";

const s0 = (): MockState => structuredClone(initialState);
const count = (s: MockState, action: string) => s.audit.filter((e) => e.action === action).length;
const rid = (s: MockState, itemId: string) => s.classResults.find((r) => r.itemId === itemId && !r.supersededBy)!.id;
const run = (task: "aktivitas" | "catatan", scope: "belum_dinilai" | "semua"): MockAction => ({ type: "runClassification", projectId: "p-p2p", task, scope });
const correct = (resultId: string, over: Partial<Extract<MockAction, { type: "correctClass" }>> = {}): MockAction =>
  ({ type: "correctClass", resultId, category: "pembayaran", reason: "Bukti mendukung", addToGoldSet: false, ...over });
const confirm = (resultId: string): MockAction => ({ type: "confirmClass", resultId });
const gold = (itemRef: string, label: string, task: TaskKind = "aktivitas"): MockAction => ({ type: "setGoldLabel", projectId: "p-p2p", task, itemRef, label });
const evaluate = (task: TaskKind = "aktivitas"): MockAction => ({ type: "runEvaluation", projectId: "p-p2p", task });
const TH: Thresholds = { sufficient: 0.5, topProb: 0.6, margin: 0.15 };
const save = (s: MockState, over: Partial<Extract<MockAction, { type: "saveSpec" }>> = {}): MockAction => {
  const a = activeSpec(s, "p-p2p", "aktivitas")!;
  return { type: "saveSpec", projectId: "p-p2p", task: "aktivitas", question: a.question, categories: a.categories.map(({ label, definition }) => ({ label, definition })), thresholds: { ...a.thresholds }, ...over };
};

describe("runClassification", () => {
  it("belum_dinilai scores only unscored items, once", () => {
    const b = s0();
    b.classResults = b.classResults.filter((r) => r.task !== "catatan");
    const r = reduce(b, run("catatan", "belum_dinilai"));
    expect(r.error).toBeUndefined();
    expect(r.state.classResults.length).toBe(b.classResults.length + 16);
    expect(count(r.state, "klasifikasi.jalankan")).toBe(count(b, "klasifikasi.jalankan") + 1);
    expect(r.state.audit[0]).toMatchObject({ objectType: "Klasifikasi", objectLabel: "catatan" });
    const again = reduce(r.state, run("catatan", "belum_dinilai"));
    expect(again.error).toBe("Semua item sudah dinilai");
    expect(again.state).toBe(r.state);
  });
  it("semua supersedes the previous current results", () => {
    const b = s0();
    const old = rid(b, "a01");
    const r = reduce(b, run("aktivitas", "semua"));
    expect(r.error).toBeUndefined();
    const oldR = r.state.classResults.find((x) => x.id === old)!;
    const fresh = r.state.classResults.find((x) => x.id === oldR.supersededBy)!;
    expect(fresh.itemId).toBe("a01");
    expect(r.state.classResults.filter((x) => x.task === "aktivitas" && !x.supersededBy).length).toBe(20);
  });
  it("uses the active spec thresholds and version, keeping old results as they were", () => {
    const b = s0();
    const v2 = reduce(b, save(b, { thresholds: { ...TH, topProb: 0.95 } })).state;
    const r = reduce(v2, run("aktivitas", "semua"));
    const a01 = r.state.classResults.find((x) => x.itemId === "a01" && !x.supersededBy)!;
    expect(a01).toMatchObject({ specVersion: 2, status: "perlu_review" });
    const old = r.state.classResults.find((x) => x.id === rid(b, "a01"))!;
    expect(old).toMatchObject({ specVersion: 1, status: "otomatis" });
  });
});

describe("correctClass", () => {
  it("adds a correction without touching results", () => {
    const b = s0();
    const id = rid(b, "a19");
    const r = reduce(b, correct(id));
    expect(r.error).toBeUndefined();
    expect(r.state.classResults).toBe(b.classResults);
    expect(r.state.classCorrections.at(-1)).toMatchObject({ resultId: id, category: "pembayaran", confirmedOnly: false });
    expect(effectiveClass(r.state.classResults.find((x) => x.id === id)!, r.state.classCorrections, []).category).toBe("pembayaran");
    expect(r.state.audit[0]).toMatchObject({ action: "klasifikasi.koreksi", objectLabel: "Payment Block Set" });
  });
  it("addToGoldSet updates the gold item", () => {
    const b = s0();
    const r = reduce(b, correct(rid(b, "a19"), { category: "lainnya", addToGoldSet: true }));
    expect(r.state.goldItems.length).toBe(b.goldItems.length);
    expect(r.state.goldItems.find((g) => g.id === "g-aktivitas-a19")!.label).toBe("lainnya");
    expect(r.state.audit.length).toBe(b.audit.length + 1);
  });
  it("rejects unknown category and bad reasons", () => {
    const b = s0();
    const id = rid(b, "a19");
    expect(reduce(b, correct(id, { category: "xyz" })).error).toBe("Kategori tidak ada di spesifikasi");
    expect(reduce(b, correct(id, { reason: "   " })).error).toBe("Alasan wajib diisi");
    const long = reduce(b, correct(id, { reason: "x".repeat(501) }));
    expect(long.error).toBe("Alasan maksimal 500 karakter");
    expect(long.state).toBe(b);
  });
  it("rejects superseded results and missing ones", () => {
    const b = s0();
    const old = rid(b, "a19");
    const s1 = reduce(b, run("aktivitas", "semua")).state;
    expect(reduce(s1, correct(old)).error).toBe("Hasil ini sudah digantikan penilaian baru");
    expect(reduce(s1, confirm(old)).error).toBe("Hasil ini sudah digantikan penilaian baru");
    expect(reduce(b, correct("nope")).error).toBe("Hasil klasifikasi tidak ditemukan");
  });
});

describe("confirmClass", () => {
  it("confirms automatic and perlu_review results with the argmax", () => {
    const b = s0();
    const r = reduce(b, confirm(rid(b, "a01")));
    expect(r.error).toBeUndefined();
    expect(r.state.classCorrections.at(-1)).toMatchObject({ confirmedOnly: true, category: "pembuatan", reason: "Dikonfirmasi analis" });
    expect(r.state.audit[0].action).toBe("klasifikasi.konfirmasi");
    const review = reduce(b, confirm(rid(b, "a02")));
    expect(review.error).toBeUndefined();
    expect(review.state.classCorrections.at(-1)!.category).toBe("pembuatan");
  });
  it("rejects failed results", () => {
    const b = s0();
    const id = rid(b, "a01");
    b.classResults = b.classResults.map((x) => (x.id === id ? { ...x, status: "gagal" as const } : x));
    expect(reduce(b, confirm(id)).error).toBe("Hanya hasil otomatis atau perlu review yang dapat dikonfirmasi");
  });
});

describe("setGoldLabel and removeGoldItem", () => {
  it("creates a new item with the viewer as labeler", () => {
    const b = s0();
    b.goldItems = b.goldItems.filter((g) => g.itemRef !== "a20");
    const r = reduce(b, gold("a20", "lainnya"));
    expect(r.error).toBeUndefined();
    expect(r.state.goldItems.at(-1)).toMatchObject({ id: "g-aktivitas-a20", itemRef: "a20", label: "lainnya", labeler: "u-dimas" });
    expect(r.goldId).toBe("g-aktivitas-a20");
    expect(r.state.audit[0]).toMatchObject({ action: "acuan.simpan", objectLabel: "a20" });
  });
  it("labeler edits label; another analyst fills labelB", () => {
    const b = s0();
    const edit = reduce(b, gold("a13", "perubahan"));
    expect(edit.state.goldItems.find((g) => g.itemRef === "a13")).toMatchObject({ label: "perubahan", labeler: "u-dimas" });
    expect(edit.state.goldItems.length).toBe(b.goldItems.length);
    const other = reduce({ ...b, viewerId: "u-anton" }, gold("a13", "perubahan"));
    expect(other.error).toBeUndefined();
    expect(other.state.goldItems.find((g) => g.itemRef === "a13")).toMatchObject({ label: "penerimaan", labelB: "perubahan", labelerB: "u-anton" });
  });
  it("rejects invalid labels, missing items and no-ops", () => {
    const b = s0();
    expect(reduce(b, gold("a13", "xyz")).error).toBe("Label tidak valid");
    expect(reduce(b, gold("a13", "relevan")).error).toBe("Label tidak valid");
    expect(reduce(b, gold("zzz", "lainnya")).error).toBe("Item tidak ditemukan");
    expect(reduce(b, gold("f-rework:c3", "relevan", "relevansi")).error).toBe("Item tidak ditemukan");
    const same = reduce(b, gold("a13", "penerimaan"));
    expect(same.error).toBe("Tidak ada perubahan");
    expect(same.state).toBe(b);
  });
  it("accepts relevance labels for relevansi", () => {
    const b = s0();
    const r = reduce(b, gold("f-bottleneck:c1", "tidak_relevan", "relevansi"));
    expect(r.state.goldItems.find((g) => g.itemRef === "f-bottleneck:c1")!.label).toBe("tidak_relevan");
  });
  it("removes a gold item", () => {
    const b = s0();
    const r = reduce(b, { type: "removeGoldItem", goldId: "g-aktivitas-a01" });
    expect(r.state.goldItems.length).toBe(b.goldItems.length - 1);
    expect(r.state.audit[0].action).toBe("acuan.hapus");
    const miss = reduce(b, { type: "removeGoldItem", goldId: "nope" });
    expect(miss.error).toBe("Item acuan tidak ditemukan");
    expect(miss.state).toBe(b);
  });
});

describe("runEvaluation", () => {
  it("adds a run each time and keeps older runs", () => {
    const b = s0();
    const r = reduce(b, evaluate());
    expect(r.error).toBeUndefined();
    expect(r.state.evaluations.length).toBe(1);
    expect(r.state.evaluations[0]).toMatchObject({ accuracy: 0.8, specVersion: 1, task: "aktivitas" });
    expect(r.evaluationId).toBe(r.state.evaluations[0].id);
    expect(r.state.audit[0]).toMatchObject({ action: "evaluasi.jalankan", objectLabel: "aktivitas" });
    const again = reduce(r.state, evaluate());
    expect(again.state.evaluations.length).toBe(2);
  });
});

describe("saveSpec", () => {
  it("creates version + 1 with slug keys", () => {
    const b = s0();
    const a = save(b) as Extract<MockAction, { type: "saveSpec" }>;
    const r = reduce(b, { ...a, categories: [...a.categories, { label: "Audit Internal", definition: " Aktivitas audit. " }], note: " tambah " });
    expect(r.error).toBeUndefined();
    const v2 = activeSpec(r.state, "p-p2p", "aktivitas")!;
    expect(v2).toMatchObject({ id: "sp-aktivitas-2", version: 2, createdBy: "u-dimas", note: "tambah" });
    expect(r.specId).toBe("sp-aktivitas-2");
    expect(v2.categories.at(-1)).toEqual({ key: "audit_internal", label: "Audit Internal", definition: "Aktivitas audit." });
    expect(v2.categories[0].key).toBe("persetujuan");
    expect(r.state.audit[0]).toMatchObject({ action: "spesifikasi.simpan", objectLabel: "aktivitas v2" });
  });
  it("rejects unchanged, duplicate and out-of-range input", () => {
    const b = s0();
    const none = reduce(b, save(b));
    expect(none.error).toBe("Tidak ada perubahan");
    expect(none.state).toBe(b);
    const a = save(b) as Extract<MockAction, { type: "saveSpec" }>;
    expect(reduce(b, { ...a, categories: [...a.categories, { label: "Lainnya!", definition: "" }] }).error).toBe("Label kategori duplikat");
    expect(reduce(b, save(b, { thresholds: { ...TH, topProb: 0.2 } })).error).toBe("Ambang probabilitas teratas harus 0,3–0,95");
    expect(reduce(b, save(b, { thresholds: { ...TH, margin: Number.NaN } })).error).toBe("Margin harus 0–0,5");
    expect(reduce(b, save(b, { question: "  " })).error).toBe("Pertanyaan wajib diisi");
  });
  it("forces relevansi categories to []", () => {
    const b = s0();
    const r = reduce(b, { type: "saveSpec", projectId: "p-p2p", task: "relevansi", question: "Pertanyaan baru?", categories: [{ label: "X", definition: "" }, { label: "Y", definition: "" }], thresholds: TH });
    expect(r.error).toBeUndefined();
    expect(activeSpec(r.state, "p-p2p", "relevansi")).toMatchObject({ version: 2, categories: [] });
  });
});

describe("permissions and project status", () => {
  const actions = (b: MockState): MockAction[] => [
    run("catatan", "semua"), correct(rid(b, "a19")), confirm(rid(b, "a01")), gold("a13", "perubahan"),
    { type: "removeGoldItem", goldId: "g-aktivitas-a01" }, evaluate(), save(b, { question: "Baru?" }),
  ];
  it.each(["u-sari", "u-rina"])("%s is refused on every action", (u) => {
    const b = { ...s0(), viewerId: u };
    for (const a of actions(b)) {
      const r = reduce(b, a);
      expect(r.error).toBe("Anda tidak berwenang melakukan aksi ini");
      expect(r.state).toBe(b);
    }
  });
  it("refuses when the project is not aktif", () => {
    const b = s0();
    b.projects.find((p) => p.id === "p-p2p")!.status = "ditangguhkan";
    for (const a of actions(b)) expect(reduce(b, a).error).toBe("Proyek ini tidak menerima data baru");
  });
});
