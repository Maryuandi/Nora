import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { bottlenecks, reworkStats, runLog, transitionCases } from "./bottleneck";
import { defaultConfig } from "./metrics";
import type { EventLog, LogCase } from "./eventlog";

const DAY = 86_400_000;
// events at day offsets; case duration = last - first
const mkCase = (id: string, evs: [string, number][]): LogCase => {
  const events = evs.map(([activity, d]) => ({ activity, activityRaw: activity, time: new Date(d * DAY).toISOString(), resource: "r" }));
  const startMs = evs[0][1] * DAY, endMs = evs[evs.length - 1][1] * DAY;
  return { id, events, startMs, endMs, durationMs: endMs - startMs };
};
const mkLog = (cases: LogCase[]): EventLog => ({ cases, activities: [], source: { sourceId: "s", snapshotId: "n", mappingVersion: 1 } });
const cfg = { ...defaultConfig("x"), bottleneckTopN: 1, bottleneckP90Days: 5 };

const log = mkLog([
  mkCase("c1", [["A", 0], ["B", 1], ["C", 11]]), // A→B 1d, B→C 10d, total 11
  mkCase("c2", [["A", 0], ["B", 2], ["C", 10]]), // 2d, 8d, total 10
]);

describe("bottlenecks", () => {
  it("computes share, order and indicated", () => {
    const b = bottlenecks(log, cfg);
    expect(b.cases).toBe(2);
    expect(b.totalCaseMs).toBe(21 * DAY);
    expect(b.transitions.map((t) => t.id)).toEqual(["B→C", "A→B"]);
    const [bc, ab] = b.transitions;
    expect(bc).toMatchObject({ from: "B", to: "C", count: 2, caseCount: 2, totalMs: 18 * DAY });
    expect(bc.sharePct).toBeCloseTo((18 / 21) * 100);
    expect(bc.indicated).toBe(true); // rank 0, p90 > 5 days
    expect(ab.indicated).toBe(false); // rank 1 >= topN
  });
  it("is not indicated when p90 is under the threshold", () => {
    expect(bottlenecks(log, { ...cfg, bottleneckP90Days: 20 }).transitions[0].indicated).toBe(false);
  });
  it("0 cases is safe", () => {
    expect(bottlenecks(mkLog([]), cfg)).toEqual({ transitions: [], totalCaseMs: 0, cases: 0 });
  });
  it("sharePct is 0 when total duration is 0", () => {
    const l = mkLog([mkCase("z", [["A", 0], ["B", 0]])]);
    expect(bottlenecks(l, cfg).transitions[0].sharePct).toBe(0);
  });
  it("ties break by id ascending", () => {
    const l = mkLog([mkCase("t", [["A", 0], ["B", 1], ["C", 2]])]);
    expect(bottlenecks(l, cfg).transitions.map((t) => t.id)).toEqual(["A→B", "B→C"]);
  });
});

describe("transitionCases", () => {
  it("sorts by longest gap and uses the longest gap per case", () => {
    const l = mkLog([...log.cases, mkCase("c3", [["B", 0], ["C", 3], ["B", 4], ["C", 20]])]);
    expect(transitionCases(l, "B", "C")).toEqual([{ caseId: "c3", gapMs: 16 * DAY }, { caseId: "c1", gapMs: 10 * DAY }, { caseId: "c2", gapMs: 8 * DAY }]);
    expect(transitionCases(l, "C", "A")).toEqual([]);
  });
});

describe("reworkStats", () => {
  const rl = mkLog([
    mkCase("r1", [["A", 0], ["B", 1], ["B", 2], ["B", 3], ["C", 10]]), // B x3, dur 10
    mkCase("r2", [["A", 0], ["B", 1], ["B", 2], ["C", 6]]), // B x2, dur 6
    mkCase("r3", [["A", 0], ["B", 1], ["C", 2]]), // dur 2
    mkCase("r4", [["A", 0], ["C", 4], ["C", 5]]), // C x2, dur 5
  ]);
  it("returns null without a definition", () => {
    expect(reworkStats(rl, { ...cfg, reworkActivities: null })).toBeNull();
  });
  it("computes per activity and overall", () => {
    const r = reworkStats(rl, { ...cfg, reworkActivities: ["B", "C", "A"] })!;
    expect(r.cases).toBe(4);
    expect(r.anyPct).toBe(75);
    expect(r.caseIds).toEqual(["r1", "r2", "r4"]);
    expect(r.activities.map((a) => a.activity)).toEqual(["B", "C", "A"]);
    const b = r.activities[0];
    expect(b).toMatchObject({ pct: 50, avgRepeats: 1.5, caseIds: ["r1", "r2"] });
    expect(b.medianWithMs).toBe(8 * DAY);
    expect(b.medianWithoutMs).toBe(3.5 * DAY);
    expect(b.diffMs).toBe(4.5 * DAY);
    const a = r.activities[2];
    expect(a).toMatchObject({ pct: 0, avgRepeats: 0, medianWithMs: null, diffMs: null });
  });
  it("0 cases is safe", () => {
    expect(reworkStats(mkLog([]), { ...cfg, reworkActivities: ["A"] })).toEqual({
      cases: 0, anyPct: 0, caseIds: [],
      activities: [{ activity: "A", pct: 0, avgRepeats: 0, medianWithMs: null, medianWithoutMs: null, diffMs: null, caseIds: [] }],
    });
  });
});

describe("runLog + seed run-2", () => {
  const run2 = initialState.runs.find((r) => r.id === "run-2")!;
  it("filters cases to the period and memoizes", () => {
    const l = runLog(initialState, run2)!;
    expect(l.cases.length).toBeGreaterThan(0);
    const from = Date.parse("2026-08-01T00:00:00Z"), to = Date.parse("2026-10-14T23:59:59.999Z");
    expect(l.cases.every((c) => c.startMs >= from && c.startMs <= to)).toBe(true);
    expect(runLog(initialState, run2)).toBe(l);
  });
  it("is empty outside the period and null without a mapping", () => {
    expect(runLog(initialState, { ...run2, periodFrom: "2030-01-01", periodTo: "2030-02-01" })!.cases).toEqual([]);
    expect(runLog({ ...initialState, mappings: [] }, { ...run2, id: "run-x" })).toBeNull();
  });
  it("ranks Record Goods Receipt→Record Invoice Receipt first and indicates it", () => {
    const b = bottlenecks(runLog(initialState, run2)!, run2.config);
    expect(b.transitions[0].id).toBe("Record Goods Receipt→Record Invoice Receipt");
    expect(b.transitions[0].indicated).toBe(true);
    expect(b.transitions.reduce((n, t) => n + t.totalMs, 0)).toBeLessThanOrEqual(b.totalCaseMs);
  });
  it("rework on seed config is defined", () => {
    const r = reworkStats(runLog(initialState, run2)!, run2.config)!;
    expect(r.activities).toHaveLength(3);
    expect(r.anyPct).toBeGreaterThanOrEqual(0);
  });
});
