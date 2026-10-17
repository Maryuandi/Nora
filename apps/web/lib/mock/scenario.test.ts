import { describe, expect, it } from "vitest";
import { ACTIVITIES, TRANSITIONS, buildCases, type RecCase } from "./rec-cases";
import { describeSpec, percentile, runScenario } from "./scenario";

const mk = (i: number, over: Partial<RecCase> = {}): RecCase => ({
  id: `c${String(i).padStart(2, "0")}`, durationDays: 10 + 2 * i, gaps: { T: 4 },
  rework: { R: i < 4 ? 2 : 0 }, activityDays: { X: i < 6 ? 3 : 0 }, unit: i < 5 ? "A" : "B", kategori: "K", ...over,
});
const ten = Array.from({ length: 10 }, (_, i) => mk(i));

describe("percentile", () => {
  it("interpolates linearly", () => {
    expect(percentile([1, 2, 3, 4, 10], 50)).toBe(3);
    expect(percentile([10, 1, 4, 3, 2], 90)).toBeCloseTo(7.6, 10);
    expect(percentile([7], 90)).toBe(7);
  });
});

describe("runScenario", () => {
  it("kurangi_jeda 50%", () => {
    const r = runScenario({ kind: "kurangi_jeda", transition: "T", pct: 50 }, ten);
    expect(r.n).toBe(10);
    expect(r.affected).toBe(10);
    expect(r.before.median).toBeCloseTo(19, 10);
    expect(r.before.p90).toBeCloseTo(26.2, 10);
    expect(r.after.median).toBeCloseTo(17, 10);
    expect(r.after.p90).toBeCloseTo(24.2, 10);
    expect(r.smallSample).toBe(true);
  });
  it("batasi_jeda only touches gaps above the cap", () => {
    const r3 = runScenario({ kind: "batasi_jeda", transition: "T", maxDays: 3 }, ten);
    expect(r3.affected).toBe(10);
    expect(r3.after.median).toBeCloseTo(18, 10);
    const r5 = runScenario({ kind: "batasi_jeda", transition: "T", maxDays: 5 }, ten);
    expect(r5.affected).toBe(0);
    expect(r5.after).toEqual(r5.before);
  });
  it("hapus_rework removes the first round(count*pct) cases by id", () => {
    const r = runScenario({ kind: "hapus_rework", activity: "R", pct: 50 }, ten);
    expect(r.affected).toBe(2);
    // durations 10,12,14,16..: first two lose 2 days -> 8,10,14,16,18,...
    expect(r.after.median).toBeCloseTo(percentile([8, 10, 14, 16, 18, 20, 22, 24, 26, 28], 50), 10);
    expect(runScenario({ kind: "hapus_rework", activity: "R", pct: 100 }, ten).affected).toBe(4);
  });
  it("lewati_aktivitas honours the filter", () => {
    expect(runScenario({ kind: "lewati_aktivitas", activity: "X", filter: null }, ten).affected).toBe(6);
    expect(runScenario({ kind: "lewati_aktivitas", activity: "X", filter: { attribute: "unit", value: "A" } }, ten).affected).toBe(5);
    expect(runScenario({ kind: "lewati_aktivitas", activity: "X", filter: { attribute: "unit", value: "Z" } }, ten).affected).toBe(0);
  });
  it("never produces a negative duration", () => {
    const r = runScenario({ kind: "kurangi_jeda", transition: "T", pct: 100 }, [mk(0, { durationDays: 1 })]);
    expect(r.after.median).toBe(0);
  });
  it("describeSpec reads as a sentence", () => {
    expect(describeSpec({ kind: "kurangi_jeda", transition: "A → B", pct: 50 })).toBe("Jeda A → B turun 50%");
  });
});

describe("dataset of 240 cases", () => {
  const cases = buildCases();
  it("is deterministic", () => {
    expect(cases).toHaveLength(240);
    expect(buildCases()).toEqual(cases);
  });
  it("matches an independent reference within 0.1%", () => {
    const spec = { kind: "kurangi_jeda", transition: TRANSITIONS[0], pct: 50 } as const;
    const r = runScenario(spec, cases);
    const after = cases.map((c) => c.durationDays - c.gaps[TRANSITIONS[0]] * 0.5).sort((a, b) => a - b);
    const ref = (v: number[], p: number) => { const i = (v.length - 1) * p; return v[Math.floor(i)] + (v[Math.ceil(i)] - v[Math.floor(i)]) * (i - Math.floor(i)); };
    expect(Math.abs(r.after.median - ref(after, 0.5)) / ref(after, 0.5)).toBeLessThan(0.001);
    expect(Math.abs(r.after.p90 - ref(after, 0.9)) / ref(after, 0.9)).toBeLessThan(0.001);
    expect(r.after.p90).toBeLessThan(r.before.p90);
  });
  it("finishes fast and flags sample size", () => {
    const t = performance.now();
    const r = runScenario({ kind: "hapus_rework", activity: ACTIVITIES[0], pct: 100 }, cases);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(r.smallSample).toBe(r.affected < 30);
    expect(runScenario({ kind: "kurangi_jeda", transition: TRANSITIONS[0], pct: 50 }, cases).smallSample).toBe(false);
  });
});
