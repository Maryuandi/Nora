import { describe, expect, it } from "vitest";
import { initialState } from "./data";
import { runLog } from "./bottleneck";
import { conformance, replayTrace } from "./replay";
import type { EventLog, LogCase } from "./eventlog";

const model = { name: "m", activities: ["A", "B", "C", "D"] };
const mkCase = (id: string, acts: string[]): LogCase => ({
  id, events: acts.map((activity, i) => ({ activity, activityRaw: activity, time: new Date(i * 1000).toISOString(), resource: "r", rowRef: 2 })),
  startMs: 0, endMs: 0, durationMs: 0, attrs: { vendor: "PT Sinar Jaya" }, objects: { po: "PO-4500001" }, complete: true,
});
const mkLog = (traces: string[][]): EventLog => ({ cases: traces.map((t, i) => mkCase(`c${i}`, t)), activities: [], source: { sourceId: "s", snapshotId: "n", mappingVersion: 1 } });

describe("replayTrace", () => {
  it("fits a trace that follows the model", () => {
    expect(replayTrace(["A", "B", "C", "D"], model)).toMatchObject({ missing: 0, remaining: 0, fitness: 1, unknown: [], perActivity: {} });
  });
  it("skipped middle activity gives missing tokens", () => {
    const r = replayTrace(["A", "C", "D"], model);
    expect(r.missing).toBe(1);
    expect(r.perActivity.C.missing).toBe(1);
    expect(r.remaining).toBe(1);
    expect(r.perActivity.B.remaining).toBe(1);
    expect(r.fitness).toBeLessThan(1);
  });
  it("repetition A,B,C,B,C,D has missing 1 and remaining 1", () => {
    const r = replayTrace(["A", "B", "C", "B", "C", "D"], model);
    expect(r.missing).toBe(1);
    expect(r.remaining).toBe(1);
    expect(r.perActivity).toEqual({ B: { missing: 1, remaining: 0 }, D: { missing: 0, remaining: 1 } });
  });
  it("collects unknown activities without touching tokens", () => {
    const r = replayTrace(["A", "X", "B", "C", "D"], model);
    expect(r.unknown).toEqual(["X"]);
    expect(r.fitness).toBe(1);
  });
  it("empty trace and empty model stay finite", () => {
    expect(Number.isFinite(replayTrace([], model).fitness)).toBe(true);
    expect(replayTrace([], { name: "e", activities: [] }).fitness).toBe(1);
  });
});

describe("conformance", () => {
  it("0 cases -> fitness 1, empty lists", () => {
    expect(conformance(mkLog([]), model)).toEqual({ fitness: 1, fitCases: 0, cases: 0, variants: [], activities: [], unknownActivities: [] });
  });
  it("aggregates variants, activities and unknowns", () => {
    const c = conformance(mkLog([["A", "B", "C", "D"], ["A", "B", "C", "D"], ["A", "C", "D"], ["A", "X", "B", "C", "D"]]), model);
    expect(c.cases).toBe(4);
    expect(c.fitCases).toBe(2);
    expect(c.variants.map((v) => v.cases)).toEqual([2, 1, 1]);
    expect(c.variants[0].caseIds).toEqual(["c0", "c1"]);
    expect(c.activities).toEqual([{ activity: "B", missing: 0, remaining: 1, cases: 1 }, { activity: "C", missing: 1, remaining: 0, cases: 1 }]);
    expect(c.unknownActivities).toEqual([{ activity: "X", cases: 1 }]);
    expect(c.fitness).toBeGreaterThan(0.8);
    expect(c.fitness).toBeLessThan(1);
  });
  it("seed run-2 is mostly fit against its BPMN model", () => {
    const run = initialState.runs.find((r) => r.id === "run-2")!;
    const c = conformance(runLog(initialState, run)!, run.config.bpmnModel!);
    expect(c.cases).toBeGreaterThan(0);
    expect(c.fitness).toBeGreaterThan(0.5);
    expect(c.fitness).toBeLessThanOrEqual(1);
    expect(c.variants.reduce((n, v) => n + v.cases, 0)).toBe(c.cases);
  });
});
