import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { backlog, compareGroups, comparePeriods, configFor, defaultConfig, durationHistogram, groupAttributes, METRIC_DEFINITIONS, metricDef, runCases, summaryCards, trend } from "./metrics";
import type { MockCase, MockState } from "./types";

const run1 = initialState.runs.find((r) => r.id === "run-1")!;
const outside = { ...run1, periodFrom: "2030-01-01", periodTo: "2030-02-01" };

describe("config", () => {
  it("seeds p2p and falls back to defaults for other projects", () => {
    expect(configFor(initialState, "p-p2p")).toMatchObject({ version: 1, updatedBy: "u-dimas", reworkActivities: expect.any(Array) });
    expect(configFor(initialState, "p-o2c")).toEqual(defaultConfig("p-o2c"));
    expect(defaultConfig("x")).toMatchObject({ version: 0, reworkActivities: null, bpmnModel: null, ageBuckets: [7, 30, 90] });
    expect(run1.config).toEqual(configFor(initialState, "p-p2p"));
    expect(run1.config.ageBuckets).not.toBe(configFor(initialState, "p-p2p").ageBuckets);
  });
});

describe("registry", () => {
  it("has the 12 ids, all version 1", () => {
    expect(METRIC_DEFINITIONS.map((m) => m.id)).toEqual(["kasus_dimulai", "kasus_selesai", "kasus_terbuka", "durasi_median", "durasi_p90", "persen_rework",
      "persen_kepatuhan", "umur_terbuka", "jeda_transisi", "kontribusi_tunggu", "fitness", "cakupan_data"]);
    expect(METRIC_DEFINITIONS.every((m) => m.version === 1 && m.formula && m.description)).toBe(true);
    expect(metricDef("fitness").name).toBe("Fitness");
  });
  it("throws for unknown id", () => expect(() => metricDef("nope")).toThrow());
});

describe("summaryCards", () => {
  it("adds up for run-1", () => {
    const c = summaryCards(initialState, run1);
    expect(c.started).toBe(runCases(initialState, run1).length);
    expect(c.finished + c.open).toBe(c.started);
    expect(c.coveragePct).toBeCloseTo((c.finished / c.started) * 100);
    expect(c.medianDays).not.toBeNull();
    expect(c.p90Days!).toBeGreaterThanOrEqual(c.medianDays!);
  });
  it("handles 0 cases without NaN", () => {
    expect(summaryCards(initialState, outside)).toEqual({ started: 0, finished: 0, open: 0, medianDays: null, p90Days: null, coveragePct: 0 });
  });
});

describe("trend", () => {
  const mk = (id: string, start: string, end: string | null): MockCase => ({ id, start, end });
  const cases = [mk("a", "2026-05-03", "2026-05-08"), mk("b", "2026-05-04", null), mk("c", "2026-05-10", "2026-05-20"), mk("d", "2026-06-01", "2026-06-02")];
  it("buckets weeks by ISO Monday (Sunday belongs to the previous week) and flags small samples", () => {
    const t = trend(cases, "minggu", 2);
    expect(t.map((x) => x.bucket)).toEqual(["2026-04-27", "2026-05-04", "2026-06-01"]);
    expect(t[0]).toEqual({ bucket: "2026-04-27", started: 1, finished: 1, medianDays: 5, small: true }); // 2026-05-03 is a Sunday
    expect(t[1]).toEqual({ bucket: "2026-05-04", started: 2, finished: 1, medianDays: 10, small: false });
  });
  it("buckets months", () => {
    const t = trend(cases, "bulan", 3);
    expect(t).toEqual([
      { bucket: "2026-05", started: 3, finished: 2, medianDays: 7.5, small: false },
      { bucket: "2026-06", started: 1, finished: 1, medianDays: 1, small: true },
    ]);
  });
  it("is empty for no cases and null median when nothing finished", () => {
    expect(trend([], "bulan", 30)).toEqual([]);
    expect(trend([mk("x", "2026-05-04", null)], "bulan", 1)[0].medianDays).toBeNull();
  });
});

describe("backlog", () => {
  it("labels buckets from ageBuckets and counts add up", () => {
    const b = backlog(initialState, run1);
    if (b.unknown) throw new Error("unexpected");
    expect(b.buckets.map((x) => x.label)).toEqual(["0–7 hari", "8–30 hari", "31–90 hari", "> 90 hari"]);
    expect(b.reference).toBe("2026-07-31"); // min(snapshot end, run periodTo)
    expect(b.buckets.reduce((n, x) => n + x.count, 0)).toBe(b.open);
    expect(b.lastActivities.reduce((n, x) => n + x.count, 0)).toBe(b.open);
    expect(b.caseIds).toHaveLength(b.open);
    expect(b.aged).toBeLessThanOrEqual(b.open);
    expect(b.lastActivities.map((x) => x.activity)).not.toContain("Clear Invoice");
  });
  it("uses frozen run.config for labels and aged threshold", () => {
    const run = { ...run1, config: { ...run1.config, ageBuckets: [10], backlogAgeDays: 1000 } };
    const b = backlog(initialState, run);
    if (b.unknown) throw new Error("unexpected");
    expect(b.buckets.map((x) => x.label)).toEqual(["0–10 hari", "> 10 hari"]);
    expect(b.aged).toBe(0);
  });
  it("is unknown when the project has no endActivity", () => {
    const s: MockState = { ...initialState, projects: initialState.projects.map((p) => (p.id === "p-p2p" ? { ...p, process: { ...p.process, endActivity: "" } } : p)) };
    expect(backlog(s, run1)).toEqual({ unknown: true });
  });
  it("is empty for 0 cases", () => {
    const b = backlog(initialState, outside);
    expect(b).toMatchObject({ unknown: false, open: 0, aged: 0, caseIds: [], lastActivities: [] });
  });
});

describe("groups", () => {
  it("lists mapped attribute columns", () => expect(groupAttributes(initialState, run1)).toEqual(["resource"]));
  it("splits cases deterministically by weighted values", () => {
    const g = compareGroups(initialState, run1, "resource").groups;
    expect(g.map((x) => x.label)).toEqual(["user_017", "user_042", "batch_01"]);
    expect(g.reduce((n, x) => n + x.cases, 0)).toBe(runCases(initialState, run1).length);
    expect(g[0].cases).toBeGreaterThan(g[2].cases);
    expect(g[0].histogram.reduce((n, b) => n + b.count, 0)).toBe(g[0].finished);
    expect(compareGroups(initialState, run1, "resource")).toEqual({ groups: g });
  });
  it("comparable follows run.config.minGroupCases", () => {
    const strict = { ...run1, config: { ...run1.config, minGroupCases: 1000 } };
    expect(compareGroups(initialState, strict, "resource").groups.map((x) => x.comparable)).toEqual([true, true, false]);
  });
  it("falls back to (kosong) for unknown attribute", () => {
    const g = compareGroups(initialState, run1, "zzz").groups;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ label: "(kosong)", cases: runCases(initialState, run1).length });
  });
  it("comparePeriods ignores run period and handles empty periods", () => {
    const { groups } = comparePeriods(initialState, outside, { from: "2026-05-01", to: "2026-05-31" }, { from: "2030-01-01", to: "2030-01-31" });
    expect(groups[0].cases).toBeGreaterThan(0);
    expect(groups[1]).toMatchObject({ cases: 0, finished: 0, medianDays: null, p90Days: null, comparable: false });
  });
});

describe("durationHistogram", () => {
  it("uses fixed bins", () => {
    const h = durationHistogram([0, 5, 6, 10, 11, 30, 31, 90]);
    expect(h.map((b) => b.bin)).toEqual(["0–5", "6–10", "11–15", "16–20", "21–25", "26–30", "> 30"]);
    expect(h.map((b) => b.count)).toEqual([2, 2, 1, 0, 0, 1, 2]);
  });
});
