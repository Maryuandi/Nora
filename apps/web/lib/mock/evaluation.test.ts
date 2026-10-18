import { describe, expect, it } from "vitest";
import { initialState as seed } from "./data";
import { BIN_EDGES, TARGETS, agreementPairs, buildEvaluation, canEditSecondLabel, cohenKappa, computeMetrics, evalPairs, reviewShareOf } from "./evaluation";
import type { EvalPair } from "./evaluation";
import type { GoldItem, MockState } from "./types";

const P = "p-p2p";
const ctx = { id: "ev-1", at: "2026-10-18T09:00:00Z", actorId: "u-dimas" };
const acc = (s: MockState, t: "relevansi" | "aktivitas" | "catatan") => computeMetrics(evalPairs(s, P, t).pairs);

describe("computeMetrics", () => {
  it("handles empty input", () => {
    const m = computeMetrics([]);
    expect(m).toMatchObject({ n: 0, accuracy: null, macroF1: null, autoCoverage: null, autoAccuracy: null, highConf: { n: 0, accuracy: null } });
    expect(m.bins).toHaveLength(5);
    expect(m.bins.every((b) => b.n === 0 && b.accuracy === null && b.meanConf === 0)).toBe(true);
    expect(BIN_EDGES).toEqual([0, 0.4, 0.6, 0.8, 0.9, 1.0]);
    expect(TARGETS.highConfAccuracy).toBe(0.8);
  });
  it("scores a single correct pair", () => {
    const m = computeMetrics([{ pred: "a", conf: 1, label: "a", auto: true }]);
    expect(m.accuracy).toBe(1);
    expect(m.macroF1).toBe(1);
    expect(m.bins[4]).toMatchObject({ n: 1, accuracy: 1, meanConf: 1 });
  });
  it("matches a hand-computed example", () => {
    const pairs: EvalPair[] = [
      { pred: "a", conf: 0.9, label: "a", auto: true },
      { pred: "a", conf: 0.7, label: "b", auto: false },
      { pred: "b", conf: 0.5, label: "b", auto: false },
      { pred: "b", conf: 0.85, label: "b", auto: true },
    ];
    const m = computeMetrics(pairs);
    expect(m.accuracy).toBe(0.75);
    expect(m.macroF1).toBeCloseTo((2 / 3 + 0.8) / 2, 4);
    expect(m.autoCoverage).toBe(0.5);
    expect(m.autoAccuracy).toBe(1);
    expect(m.highConf).toEqual({ n: 2, accuracy: 1 });
    expect(m.bins.map((b) => b.n)).toEqual([0, 1, 1, 1, 1]);
    expect(m.bins[3]).toMatchObject({ n: 1, accuracy: 1, meanConf: 0.85 });
    expect(m.bins[0].accuracy).toBeNull();
  });
  it("puts edge values in the right bin", () => {
    const m = computeMetrics([0.4, 0.8, 1.0].map((conf) => ({ pred: "a", conf, label: "a", auto: true })));
    expect(m.bins.map((b) => b.n)).toEqual([0, 1, 0, 1, 1]);
    expect(m.highConf.n).toBe(2);
  });
});

describe("cohenKappa", () => {
  it("is 1 on full agreement with two classes", () => expect(cohenKappa([{ a: "x", b: "x" }, { a: "y", b: "y" }])).toBe(1));
  it("is negative for pure disagreement", () => expect(cohenKappa([{ a: "x", b: "y" }, { a: "y", b: "x" }])).toBeLessThan(0));
  it("is null on zero denominator or too few pairs", () => {
    expect(cohenKappa([{ a: "x", b: "x" }, { a: "x", b: "x" }])).toBeNull();
    expect(cohenKappa([{ a: "x", b: "x" }])).toBeNull();
    expect(cohenKappa([])).toBeNull();
  });
});

describe("evalPairs", () => {
  it("pairs relevance gold with the model verdict", () => {
    const r = evalPairs(seed, P, "relevansi");
    expect(r.items).toHaveLength(6);
    expect(r.pairs.find((p) => p.label === "sebagian_relevan" && p.pred === "relevan")).toBeTruthy();
  });
  it("excludes failed, superseded and missing candidates without crashing", () => {
    const gold = (itemRef: string): GoldItem => ({ id: `g-${itemRef}`, projectId: P, task: "relevansi", itemRef, label: "relevan", labeler: "u-dimas", createdAt: "x" });
    const base = { ...seed, goldItems: [gold("f-rework:c8")] };
    expect(evalPairs(base, P, "relevansi")).toMatchObject({ excluded: 1, pairs: [] });
    const gone = { ...seed, goldItems: [gold("f-rework:c999")] };
    expect(evalPairs(gone, P, "relevansi").excluded).toBe(1);
    const sup = { ...seed, assessments: seed.assessments.map((a) => (a.candidateId === "c7" ? { ...a, supersededBy: "z" } : a)), goldItems: [gold("f-rework:c7")] };
    expect(evalPairs(sup, P, "relevansi").excluded).toBe(1);
  });
  it("excludes classification items without a usable result", () => {
    const g: GoldItem = { id: "g-aktivitas-zz", projectId: P, task: "aktivitas", itemRef: "zz", label: "pembuatan", labeler: "u-dimas", createdAt: "x" };
    expect(evalPairs({ ...seed, goldItems: [g] }, P, "aktivitas").excluded).toBe(1);
  });
});

describe("seed gold set", () => {
  it("gives the planned accuracies", () => {
    expect(acc(seed, "relevansi")).toMatchObject({ n: 6, accuracy: 5 / 6 });
    expect(acc(seed, "aktivitas")).toMatchObject({ n: 20, accuracy: 16 / 20 });
    expect(acc(seed, "catatan")).toMatchObject({ n: 16, accuracy: 14 / 16 });
  });
  it("uses the planned gold ids", () => {
    const ids = seed.goldItems.map((g) => g.id);
    expect(ids).toContain("g-relevansi-f-bottleneck-c1");
    expect(ids).toContain("g-aktivitas-a01");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("computes review share", () => {
    expect(reviewShareOf(seed, P, "aktivitas")).toBeCloseTo(0.2, 9);
    expect(reviewShareOf(seed, P, "catatan")).toBeCloseTo(2 / 16, 9);
    expect(reviewShareOf(seed, P, "relevansi")).not.toBeNull();
    expect(reviewShareOf({ ...seed, classResults: [] }, P, "catatan")).toBeNull();
  });
  it("has 12 double-labelled activities with a kappa between 0 and 1", () => {
    expect(agreementPairs(seed, P, "aktivitas")).toHaveLength(12);
    const k = cohenKappa(agreementPairs(seed, P, "aktivitas"))!;
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });
});

describe("buildEvaluation", () => {
  it("builds a run from the seed", () => {
    const e = buildEvaluation(seed, P, "aktivitas", ctx)!;
    expect(e).toMatchObject({ id: "ev-1", n: 20, excluded: 0, accuracy: 0.8, specVersion: 1, modelId: "jev-demo-fixture", actorId: "u-dimas" });
    expect(e.kappa).not.toBeNull();
    expect(e.reviewShare).toBeCloseTo(0.2, 9);
  });
  it("returns n=0 without NaN for an empty gold set", () => {
    const e = buildEvaluation({ ...seed, goldItems: [] }, P, "catatan", ctx)!;
    expect(e).toMatchObject({ n: 0, accuracy: 0, macroF1: 0, autoCoverage: 0, autoAccuracy: null, kappa: null });
    expect(Object.values(e).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });
  it("returns null without an active spec", () => {
    expect(buildEvaluation({ ...seed, specs: [] }, P, "catatan", ctx)).toBeNull();
  });
});

describe("evalPairs informasi_tidak_cukup", () => {
  it("predicts that label with confidence 1 - P(sufficient)", () => {
    const item = evalPairs(seed, P, "relevansi").items.find((i) => i.gold.itemRef.endsWith(":c5"))!;
    expect(item.result).toMatchObject({ pred: "informasi_tidak_cukup" });
    expect(item.result!.conf).toBeCloseTo(0.69, 9);
  });
});

describe("canEditSecondLabel", () => {
  const g = seed.goldItems.find((x) => x.labeler === "u-dimas")!;
  it("is offered to another labeler only", () => {
    expect(canEditSecondLabel(g, "u-anton")).toBe(true);
    expect(canEditSecondLabel(g, "u-dimas")).toBe(false);
  });
});
