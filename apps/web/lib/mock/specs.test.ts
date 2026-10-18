import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { DEFAULT_THRESHOLDS, activeSpec, isStale, slugify, specVersions, validateSpecInput } from "./specs";

const th = DEFAULT_THRESHOLDS;
const cats = [{ label: "Satu", definition: "" }, { label: "Dua", definition: "" }];
const input = { question: "Apa?", categories: cats, thresholds: th };
const v2 = { ...initialState.specs.find((x) => x.task === "aktivitas")!, id: "sp-aktivitas-2", version: 2 };
const s2 = { ...initialState, specs: [...initialState.specs, v2] };

describe("slugify", () => {
  it("lowercases and underscores", () => {
    expect(slugify("Pencatatan Dokumen")).toBe("pencatatan_dokumen");
    expect(slugify("  Harga/Tak Sesuai! ")).toBe("harga_tak_sesuai");
  });
});

describe("seed specs", () => {
  it("has one v1 per task with the documented categories", () => {
    expect(initialState.specs.map((x) => x.id).sort()).toEqual(["sp-aktivitas-1", "sp-catatan-1", "sp-relevansi-1"]);
    expect(activeSpec(initialState, "p-p2p", "aktivitas")!.categories.map((c) => c.key)).toEqual(
      ["persetujuan", "pembuatan", "perubahan", "pembatalan", "penerimaan", "pencatatan_dokumen", "pembayaran", "lainnya"]);
    expect(activeSpec(initialState, "p-p2p", "catatan")!.categories.map((c) => c.key)).toEqual(
      ["harga_tidak_sesuai", "kuantitas_tidak_sesuai", "dokumen_kurang", "vendor_salah", "lainnya"]);
    expect(activeSpec(initialState, "p-p2p", "relevansi")!.categories).toEqual([]);
  });
  it("every seed category key equals the slug of its label", () => {
    for (const sp of initialState.specs) for (const c of sp.categories) expect(slugify(c.label)).toBe(c.key);
  });
});

describe("activeSpec / specVersions / isStale", () => {
  it("picks the highest version and lists newest first", () => {
    expect(activeSpec(s2, "p-p2p", "aktivitas")!.version).toBe(2);
    expect(specVersions(s2, "p-p2p", "aktivitas").map((x) => x.version)).toEqual([2, 1]);
    expect(activeSpec(s2, "p-other", "aktivitas")).toBeUndefined();
  });
  it("flags older result versions only", () => {
    expect(isStale(1, s2, "p-p2p", "aktivitas")).toBe(true);
    expect(isStale(2, s2, "p-p2p", "aktivitas")).toBe(false);
    expect(isStale(1, initialState, "p-p2p", "aktivitas")).toBe(false);
  });
});

describe("validateSpecInput", () => {
  it("accepts valid input and relevansi without categories", () => {
    expect(validateSpecInput("aktivitas", input)).toBeNull();
    expect(validateSpecInput("relevansi", { ...input, categories: [] })).toBeNull();
  });
  it.each([
    ["Pertanyaan wajib diisi", { question: "  " }],
    ["Pertanyaan maksimal 300 karakter", { question: "a".repeat(301) }],
    ["Minimal 2 kategori", { categories: [cats[0]] }],
    ["Label kategori wajib diisi", { categories: [cats[0], { label: " ", definition: "x" }] }],
    ["Label kategori duplikat", { categories: [cats[0], { label: "satu!", definition: "" }] }],
    ["Definisi maksimal 200 karakter", { categories: [cats[0], { label: "Dua", definition: "d".repeat(201) }] }],
  ])("rejects: %s", (msg, patch) => {
    expect(validateSpecInput("aktivitas", { ...input, ...patch })).toBe(msg);
  });
  it("accepts a 300-char question and 200-char definition", () => {
    expect(validateSpecInput("catatan", { ...input, question: "a".repeat(300), categories: [cats[0], { label: "Dua", definition: "d".repeat(200) }] })).toBeNull();
  });
});
