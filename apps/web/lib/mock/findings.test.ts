import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { baselineFor, compareFindings, findingsFor, severityOf, type Finding } from "./findings";
import { defaultConfig } from "./metrics";

const run1 = initialState.runs.find((r) => r.id === "run-1")!;
const run2 = initialState.runs.find((r) => r.id === "run-2")!;
const cfg = defaultConfig("x");

const mk = (key: string, measure: number, o: Partial<Finding> = {}): Finding => ({
  id: key, runId: "r", kind: "rework", key, title: key, measure, threshold: 10, higherIsWorse: true, unit: "%",
  affectedCases: 5, populationCases: 100, severity: "rendah", supportingCaseIds: [], caseSource: "log_event", ...o,
});

describe("severityOf", () => {
  const f = (affectedCases: number) => ({ affectedCases, populationCases: 100, measure: 10, threshold: 10, higherIsWorse: true });
  it("thresholds 0.15 / 0.5", () => {
    expect(severityOf(f(14))).toBe("rendah");
    expect(severityOf(f(15))).toBe("sedang");
    expect(severityOf(f(49))).toBe("sedang");
    expect(severityOf(f(50))).toBe("tinggi");
  });
  it("handles zero population, zero threshold and lower-is-worse", () => {
    expect(severityOf({ ...f(5), populationCases: 0 })).toBe("rendah");
    expect(severityOf({ ...f(20), threshold: 0 })).toBe("sedang");
    expect(severityOf({ affectedCases: 50, populationCases: 100, measure: 0.3, threshold: 0.9, higherIsWorse: false })).toBe("tinggi");
  });
});

describe("baselineFor", () => {
  it("run-2 -> run-1, run-1 -> null", () => {
    expect(baselineFor(initialState, run2)?.id).toBe("run-1");
    expect(baselineFor(initialState, run1)).toBeNull();
  });
});

describe("compareFindings", () => {
  it("no baseline -> all baru", () => {
    expect(compareFindings([mk("a", 10)], null, cfg).map((c) => c.status)).toEqual(["baru"]);
  });
  it("covers all five statuses, ordering and smallSample", () => {
    const cur = [mk("up", 20), mk("new", 5), mk("same", 10), mk("down", 5), mk("small", 50, { populationCases: 10 })];
    const base = [mk("up", 10), mk("same", 10), mk("down", 10), mk("gone", 7), mk("small", 10)];
    const r = compareFindings(cur, base, cfg);
    expect(r.map((c) => c.status)).toEqual(["memburuk", "baru", "stabil", "stabil", "membaik", "tidak_lagi_terdeteksi"]);
    expect(r.find((c) => c.finding.key === "small")).toMatchObject({ smallSample: true, status: "stabil" });
    expect(r.find((c) => c.finding.key === "gone")!.baselineMeasure).toBe(7);
  });
  it("respects higherIsWorse=false and base 0", () => {
    const r = compareFindings([mk("fit", 0.5, { higherIsWorse: false }), mk("z", 3)], [mk("fit", 0.9, { higherIsWorse: false }), mk("z", 0)], cfg);
    expect(r.map((c) => c.status).sort()).toEqual(["memburuk", "memburuk"]);
  });
});

describe("findingsFor seed", () => {
  const fs = findingsFor(initialState, run2);
  it("has titles without 'penyebab' and ids", () => {
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) { expect(f.title.toLowerCase()).not.toContain("penyebab"); expect(f.id).toBe(`run-2:${f.kind}:${f.key}`); expect(f.supportingCaseIds.length).toBeLessThanOrEqual(50); }
    for (const f of fs.filter((x) => x.kind === "bottleneck")) expect(f.title.startsWith("Indikasi bottleneck")).toBe(true);
  });
  it("kepatuhan wording follows rule status (both branches)", () => {
    const k = (status: "disetujui" | "ditinjau") => {
      const rules = run2.ruleVersions.map((r) => ({ ...r, status }));
      return findingsFor(initialState, { ...run2, ruleVersions: rules, config: { ...run2.config, complianceHighPct: 0 } }).filter((f) => f.kind === "kepatuhan");
    };
    const a = k("disetujui"), b = k("ditinjau");
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((f) => f.title.startsWith("Pelanggaran aturan"))).toBe(true);
    expect(b.every((f) => f.title.startsWith("Tidak sesuai dengan acuan aturan"))).toBe(true);
  });
  it("kepatuhan names the applied version, not the latest in the run", () => {
    const loose = { ...run1.config, complianceHighPct: 0 };
    const k1 = findingsFor(initialState, { ...run1, config: loose }).find((f) => f.kind === "kepatuhan" && f.key === "r-sla")!;
    expect(k1.title).not.toContain("Pelanggaran");
    expect(k1.title).not.toContain("hari kerja");
    expect(k1.title.startsWith("Tidak sesuai dengan acuan aturan")).toBe(true);
    // v1 (usang) violations in run-2 keep the neutral term; only disetujui-only violations say Pelanggaran
    const onlyV2 = { ...run2, ruleVersions: run2.ruleVersions.filter((r) => r.ruleKey !== "r-sla" || r.version === 2), config: { ...run2.config, complianceHighPct: 0 } };
    const k2 = findingsFor(initialState, onlyV2).find((f) => f.kind === "kepatuhan" && f.key === "r-sla")!;
    expect(k2.title.startsWith("Pelanggaran aturan")).toBe(true);
    expect(k2.ruleVersionId).toBe("r-sla-2");
  });
  it("no kepatuhan/rework finding when nothing is affected", () => {
    const zero = findingsFor(initialState, { ...run2, ruleVersions: run2.ruleVersions.filter((r) => r.ruleKey === "r-urutan"), config: { ...run2.config, complianceHighPct: 0, reworkHighPct: 0 } });
    for (const f of zero.filter((x) => x.kind === "kepatuhan" || x.kind === "rework")) expect(f.affectedCases).toBeGreaterThan(0);
  });
  it("each kind appears with permissive config", () => {
    const loose = { ...run2.config, bottleneckP90Days: 0, reworkHighPct: 0, complianceHighPct: 0, fitnessMin: 1.01, backlogAgeDays: 0, changePct: -100, smallSampleCases: 0 };
    const kinds = new Set(findingsFor(initialState, { ...run2, config: loose }).map((f) => f.kind));
    expect([...kinds].sort()).toEqual(["backlog", "bottleneck", "kepatuhan", "penyimpangan_model", "rework", "tren_memburuk"]);
  });
  it("title uses decimal comma", () => {
    const rw = fs.find((f) => f.kind === "rework")!;
    expect(rw.title).toMatch(/^Rework tinggi pada aktivitas .+: \d+,\d% kasus mengulang$/);
  });
  it("demo: r-sla kepatuhan is memburuk in run-2 vs run-1", () => {
    const base = findingsFor(initialState, baselineFor(initialState, run2)!);
    const cmp = compareFindings(fs, base, run2.config);
    expect(fs.some((f) => f.kind === "bottleneck")).toBe(true);
    expect(cmp.find((c) => c.finding.kind === "kepatuhan" && c.finding.key === "r-sla")?.status).toBe("memburuk");
  });
});
