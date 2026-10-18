import { describe, expect, it } from "vitest";
import { classQueue, classStatus, classSummary, currentClassResults, effectiveClass, noteAggregation, runClassFixture, topTwoOf } from "./classification";
import { CLASS_FIXTURE, classItems } from "./classification-data";
import { initialState } from "./data";
import { activeSpec } from "./specs";
import type { ClassCorrection, ClassResult } from "./types";

const th = { sufficient: 0.5, topProb: 0.6, margin: 0.15 };
const s = initialState;
const res = (id: string, probs: Record<string, number>, extra: Partial<ClassResult> = {}): ClassResult =>
  ({ id, projectId: "p-p2p", itemId: id, task: "aktivitas", specVersion: 1, modelId: "m", runId: "r", at: "2026-10-17T09:00:00Z", probs, status: "otomatis", ...extra });
const corr = (resultId: string, category: string, at: string): ClassCorrection =>
  ({ id: `${resultId}-${at}`, resultId, actorId: "u-dimas", at, category, reason: "x", confirmedOnly: false });

describe("classStatus", () => {
  it("flags low top probability", () => expect(classStatus({ a: 0.59, b: 0.1, c: 0.31 }, th)).toBe("perlu_review"));
  it("passes exactly 0.6 with both others 0.3", () => expect(classStatus({ a: 0.6, b: 0.3, c: 0.1 }, th)).toBe("otomatis"));
  it("flags margin 0.14", () => expect(classStatus({ a: 0.7, b: 0.56, c: 0.01 }, th)).toBe("perlu_review"));
  it("passes margin exactly 0.15", () => {
    expect(classStatus({ a: 0.7, b: 0.55 }, th)).toBe("otomatis");
    expect(classStatus({ a: 0.75, b: 0.6 }, th)).toBe("otomatis");
  });
  it("failed wins", () => expect(classStatus({ a: 0.9, b: 0.1 }, th, true)).toBe("gagal"));
  it("honours custom thresholds", () => {
    expect(classStatus({ a: 0.85, b: 0.05, c: 0.1 }, th)).toBe("otomatis");
    expect(classStatus({ a: 0.85, b: 0.05, c: 0.1 }, { ...th, topProb: 0.9 })).toBe("perlu_review");
  });
});

describe("topTwoOf", () => {
  it("breaks ties by order", () => {
    const r = topTwoOf({ a: 0.4, b: 0.4, c: 0.2 }, ["b", "a", "c"]);
    expect(r.top[0]).toBe("b");
    expect(r.second[0]).toBe("a");
    expect(r.margin).toBe(0);
  });
});

describe("topTwoOf with keys missing from the order", () => {
  const probs = { persetujuan: 0.9, pembuatan: 0.1 };
  it("still ranks result keys that left the active spec", () => {
    const r = topTwoOf(probs, ["approval", "pembuatan"]);
    expect(r.top).toEqual(["persetujuan", 0.9]);
    expect(r.second).toEqual(["pembuatan", 0.1]);
  });
  it("effectiveClass returns the raw key", () => {
    expect(effectiveClass(res("r9", probs), [], ["approval", "pembuatan"]).category).toBe("persetujuan");
  });
});

describe("effectiveClass", () => {
  const r = res("r1", { a: 0.7, b: 0.3 });
  it("uses argmax without corrections", () => expect(effectiveClass(r, [], ["a", "b"])).toEqual({ category: "a", source: "model" }));
  it("latest correction wins; equal at -> later index", () => {
    const cs = [corr("r1", "b", "2026-10-17T10:00:00Z"), corr("r1", "a", "2026-10-17T10:00:00Z"), corr("zz", "b", "2026-10-18T10:00:00Z")];
    expect(effectiveClass(r, cs, ["a", "b"]).category).toBe("a");
    expect(effectiveClass(r, [cs[0]], ["a", "b"])).toMatchObject({ category: "b", source: "analis", correction: cs[0] });
  });
  it("does not mutate frozen input", () => {
    const fr = Object.freeze(res("r2", Object.freeze({ a: 0.2, b: 0.8 }) as Record<string, number>));
    expect(() => effectiveClass(fr, Object.freeze([]) as unknown as ClassCorrection[], Object.freeze(["a", "b"]) as unknown as string[])).not.toThrow();
  });
});

describe("seed queue and summary", () => {
  it("queue has the six review items, smallest margin first", () => {
    const a = classQueue(s, "p-p2p", "aktivitas").map((r) => r.itemId);
    const n = classQueue(s, "p-p2p", "catatan").map((r) => r.itemId);
    expect(a).toEqual(["a18", "a02", "a06", "a14"]);
    expect(n).toEqual(["n11", "n14"]);
  });
  it("queue excludes corrected and superseded; gagal first", () => {
    const q0 = currentClassResults(s, "p-p2p", "aktivitas");
    const a18 = q0.find((r) => r.itemId === "a18")!;
    const st = {
      ...s,
      classCorrections: [corr(a18.id, "pembuatan", "2026-10-17T10:00:00Z")],
      classResults: [...s.classResults.map((r) => (r.itemId === "a02" ? { ...r, supersededBy: "x" } : r)),
        res("g1", { a: 0.5, b: 0.5 }, { itemId: "a99", status: "gagal" })],
    };
    expect(classQueue(st, "p-p2p", "aktivitas").map((r) => r.itemId)).toEqual(["a99", "a06", "a14"]);
  });
  it("summary has all status keys, no unscored on seed", () => {
    const order = activeSpec(s, "p-p2p", "aktivitas")!.categories.map((c) => c.key);
    const sum = classSummary(s, "p-p2p", "aktivitas", order);
    expect(Object.keys(sum.byStatus).sort()).toEqual(["gagal", "otomatis", "perlu_review"]);
    expect(sum.byStatus).toEqual({ otomatis: 16, perlu_review: 4, gagal: 0 });
    expect(sum.unscored).toBe(0);
    expect(Object.values(sum.byCategory).reduce((x, y) => x + y, 0)).toBe(20);
    expect(sum.byCategory.perubahan).toBe(4);
  });
  it("summary counts unscored when results removed; corrections change category", () => {
    const order = activeSpec(s, "p-p2p", "aktivitas")!.categories.map((c) => c.key);
    const a19 = s.classResults.find((r) => r.itemId === "a19")!;
    const st = { ...s, classResults: s.classResults.filter((r) => r.itemId !== "a01"), classCorrections: [corr(a19.id, "pembayaran", "2026-10-17T10:00:00Z")] };
    const sum = classSummary(st, "p-p2p", "aktivitas", order);
    expect(sum.unscored).toBe(1);
    expect(sum.byCategory.pembayaran).toBe(2);
    expect(sum.byCategory.lainnya).toBe(2);
  });
});

describe("noteAggregation", () => {
  const agg = noteAggregation(s, "p-p2p");
  it("totals 16 across rows and periods", () => {
    expect(agg.rows.map((r) => r.total)).toEqual([8, 8]);
    expect(agg.rows.reduce((x, r) => x + r.total, 0)).toBe(16);
    expect(agg.periods.map((p) => [p.period, p.total])).toEqual([["2026-07", 5], ["2026-08", 6], ["2026-09", 5]]);
    for (const g of [...agg.rows, ...agg.periods]) expect(Object.values(g.counts).reduce((x, y) => x + y, 0)).toBe(g.total);
  });
  it("uses corrections", () => {
    const n11 = s.classResults.find((r) => r.itemId === "n11")!;
    const st = { ...s, classCorrections: [corr(n11.id, "dokumen_kurang", "2026-10-17T10:00:00Z")] };
    const a = noteAggregation(st, "p-p2p");
    expect(a.periods.find((p) => p.period === "2026-08")!.counts.dokumen_kurang).toBe(2);
    expect(a.periods.find((p) => p.period === "2026-08")!.counts.vendor_salah).toBe(1);
  });
  it("falls back to sorted keys when spec is missing", () => {
    const a = noteAggregation({ ...s, specs: [] }, "p-p2p");
    expect(Object.keys(a.rows[0].counts)).toEqual(["dokumen_kurang", "harga_tidak_sesuai", "kuantitas_tidak_sesuai", "lainnya", "vendor_salah"]);
    expect(a.rows.reduce((x, r) => x + r.total, 0)).toBe(16);
  });
});

describe("runClassFixture", () => {
  const spec = activeSpec(s, "p-p2p", "aktivitas")!;
  const items = classItems.filter((i) => i.task === "aktivitas");
  const ctx = { runId: "run-t", at: "2026-10-18T09:00:00Z" };
  it("is deterministic with run-item ids", () => {
    const r = runClassFixture(items, spec, ctx);
    expect(r).toEqual(runClassFixture(items, spec, ctx));
    expect(r[0]).toMatchObject({ id: "run-t-a01", itemId: "a01", runId: "run-t", at: ctx.at, modelId: "jev-demo-fixture", specVersion: spec.version, status: "otomatis" });
    expect(r[0].probs.pembuatan).toBeCloseTo(0.93, 9);
  });
  it("item without fixture fails with uniform probs", () => {
    const [r] = runClassFixture([{ ...items[0], id: "zz" }], spec, ctx);
    expect(r.status).toBe("gagal");
    expect(Object.keys(r.probs)).toHaveLength(spec.categories.length);
    for (const p of Object.values(r.probs)) expect(p).toBeCloseTo(1 / spec.categories.length, 9);
  });
  it("reduced spec: no foreign keys, sums to 1", () => {
    const small = { ...spec, categories: spec.categories.filter((c) => ["pembuatan", "lainnya", "pembayaran"].includes(c.key)) };
    for (const r of runClassFixture(items, small, ctx)) {
      expect(Object.keys(r.probs).every((k) => small.categories.some((c) => c.key === k))).toBe(true);
      expect(Object.values(r.probs).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    }
  });
  it("topProb 0.95 makes nearly all perlu_review", () => {
    const strict = { ...spec, thresholds: { ...spec.thresholds, topProb: 0.95 } };
    const r = runClassFixture(items, strict, ctx);
    expect(r.filter((x) => x.status === "perlu_review").length).toBeGreaterThanOrEqual(19);
  });
  it("fixture covers every seed item", () => {
    for (const i of classItems) expect(CLASS_FIXTURE[i.id]).toBeDefined();
  });
});
