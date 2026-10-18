import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { eventLogFor } from "./eventlog";
import { reduce, type MockAction } from "./reducer";
import type { MockState } from "./types";

const P = "p-p2p";
const s0 = (): MockState => structuredClone(initialState);
type Save = Extract<MockAction, { type: "saveView" }>;
const save = (over: Partial<Save> = {}): Save => ({
  type: "saveView", projectId: P, name: "Tampilan uji", filter: {}, mode: "frekuensi", selection: null, activityPct: 80, transitionPct: 60, ...over,
});
const as = (userId: string, s = s0()): MockState => ({ ...s, viewerId: userId });
const withStatus = (status: "ditangguhkan" | "berakhir"): MockState => {
  const s = s0();
  s.projects.find((p) => p.id === P)!.status = status;
  return s;
};
// An active project the viewer belongs to that has no usable data.
const noData = (): MockState => {
  const s = s0();
  s.snapshots = s.snapshots.filter((x) => x.projectId !== P);
  expect(eventLogFor(s, P)).toBeNull();
  return s;
};
const rejected = (s: MockState, a: Save, error: string) => {
  const r = reduce(s, a);
  expect(r.error).toBe(error);
  expect(r.state).toBe(s);
  expect(r.savedViewId).toBeUndefined();
};

describe("saveView: success", () => {
  it("stores the view with current data identity, a normalized filter and exactly one audit event", () => {
    const before = s0();
    const cur = eventLogFor(before, P)!;
    const r = reduce(before, save({
      name: "  Vendor lambat  ", note: "  catatan  ", mode: "performa", selection: { kind: "edge", id: "e1" },
      filter: { vendors: ["PT Sinar Jaya", "CV Mitra Abadi", "PT Sinar Jaya"], po: "  PO-1  ", completion: "semua" },
    }));
    expect(r.error).toBeUndefined();
    expect(r.state.savedViews.length).toBe(before.savedViews.length + 1);
    const v = r.state.savedViews.find((x) => x.id === r.savedViewId)!;
    expect(v).toMatchObject({
      projectId: P, name: "Vendor lambat", note: "catatan", mode: "performa", selection: { kind: "edge", id: "e1" },
      activityPct: 80, transitionPct: 60, createdBy: before.viewerId,
      sourceId: cur.log.source.sourceId, snapshotId: cur.snapshot.id, mappingVersion: cur.mappingVersion,
      filter: { vendors: ["CV Mitra Abadi", "PT Sinar Jaya"], po: "PO-1" },
    });
    expect(v.filter).not.toHaveProperty("completion");
    expect(r.state.audit.length).toBe(before.audit.length + 1);
    expect(r.state.audit[0]).toMatchObject({ action: "tampilan.simpan", objectType: "Tampilan", objectLabel: "Vendor lambat", projectId: P, result: "sukses" });
    expect(before.savedViews.length).toBe(0); // input state untouched
  });
  it("omits an empty note and allows administrator", () => {
    const r = reduce(as("u-rina"), save({ note: "   " }));
    expect(r.error).toBeUndefined();
    expect(r.state.savedViews[0]).not.toHaveProperty("note");
  });
  it("gives each saved view its own id", () => {
    const a = reduce(s0(), save());
    const b = reduce(a.state, save());
    expect(b.state.savedViews.length).toBe(2);
    expect(a.savedViewId).not.toBe(b.savedViewId);
  });
});

describe("saveView: guards (in order)", () => {
  it("unknown project", () => rejected(s0(), save({ projectId: "nope" }), "Proyek tidak ditemukan"));
  it("inactive project", () => {
    rejected(withStatus("ditangguhkan"), save(), "Proyek ini tidak menerima perubahan");
    rejected(withStatus("berakhir"), save(), "Proyek ini tidak menerima perubahan");
  });
  it("no data", () => rejected(noData(), save(), "Belum ada data yang siap dinilai"));
  it("pemilik_proses is rejected", () => rejected(as("u-sari"), save(), "Peranmu tidak dapat menyimpan tampilan"));
  it("non-member is rejected", () => rejected(as("u-lia"), save(), "Peranmu tidak dapat menyimpan tampilan"));
  it("empty name, trimmed", () => {
    rejected(s0(), save({ name: "" }), "Nama wajib diisi");
    rejected(s0(), save({ name: "   \n " }), "Nama wajib diisi");
  });
  it("name length boundary 80 / 81 after trim", () => {
    expect(reduce(s0(), save({ name: ` ${"a".repeat(80)} ` })).error).toBeUndefined();
    rejected(s0(), save({ name: "a".repeat(81) }), "Nama terlalu panjang");
  });
  it("note length boundary 500 / 501", () => {
    expect(reduce(s0(), save({ note: "b".repeat(500) })).error).toBeUndefined();
    rejected(s0(), save({ note: "b".repeat(501) }), "Catatan terlalu panjang");
  });
  it("invalid filter returns the first validateFilter message", () => {
    rejected(s0(), save({ filter: { period: { by: "mulai", from: "2026-05-02", to: "2026-05-01" } } }), "Tanggal mulai tidak boleh setelah tanggal akhir");
    rejected(s0(), save({ filter: { duration: { minDays: -1 } } }), "Durasi minimal tidak boleh negatif");
    rejected(s0(), save({ filter: { duration: { minDays: NaN } } }), "Durasi minimal harus berupa angka");
  });

  // Ordering: every earlier guard wins over every later failure.
  const bad = { name: "", note: "x".repeat(501), filter: { duration: { minDays: -1 } } };
  it("project missing beats everything", () => rejected(as("u-sari", withStatus("ditangguhkan")), save({ projectId: "nope", ...bad }), "Proyek tidak ditemukan"));
  it("inactive beats no-data, role and input errors", () => {
    const s = as("u-sari", withStatus("ditangguhkan"));
    s.snapshots = s.snapshots.filter((x) => x.projectId !== P);
    rejected(s, save(bad), "Proyek ini tidak menerima perubahan");
  });
  it("no data beats role and input errors", () => rejected(as("u-sari", noData()), save(bad), "Belum ada data yang siap dinilai"));
  it("role beats name, note and filter errors", () => rejected(as("u-sari"), save(bad), "Peranmu tidak dapat menyimpan tampilan"));
  it("name beats note and filter errors", () => rejected(s0(), save(bad), "Nama wajib diisi"));
  it("long name beats long note", () => rejected(s0(), save({ ...bad, name: "a".repeat(81) }), "Nama terlalu panjang"));
  it("note beats filter error", () => rejected(s0(), save({ ...bad, name: "ok" }), "Catatan terlalu panjang"));
  it("never throws on odd input", () => {
    expect(() => reduce(s0(), save({ name: undefined as unknown as string }))).not.toThrow();
  });
});
