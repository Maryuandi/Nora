import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import {
  buildDfg, buildEventLog, casesForEdge, casesForNode, defaultSimplify, END_ID, eventLogFor, pageOf, processActivities, simplify, sortCases,
  START_ID, type EventLog, type LogCase,
} from "./eventlog";
import type { MappingVersion, Snapshot } from "./types";

const sn1 = s.snapshots.find((x) => x.id === "sn-1")!;
const m1 = s.mappings[0];
const SEED = ["Create Purchase Order Item", "Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function snap(acts: string[], over: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "sn-t", sourceId: "s-t", projectId: "p-t", fileName: "t.csv", sizeBytes: 1, format: "csv", checksum: "abc123def456", uploadedBy: "u", uploadedAt: "2026-01-01T00:00:00Z",
    status: "siap_dipetakan",
    stats: { rows: 600, rejected: 0, encoding: "UTF-8", delimiter: ",", timeFrom: "2026-01-02", timeTo: "2026-03-02", latestEventAt: "2026-03-02", newEvents: 600, duplicateEvents: 0, conflictEvents: 0 },
    columns: [{ name: "case_id", samples: [] }, { name: "activity", samples: [] }, { name: "timestamp", samples: [] }],
    preview: acts.map((a, i) => [`C${i}`, a, "2026-01-02 08:00:00"]),
    ...over,
  };
}
const mapping = (over: Partial<MappingVersion> = {}): MappingVersion => ({
  id: "m-t", sourceId: "s-t", snapshotId: "sn-t", projectId: "p-t", version: 1,
  roles: { case_id: "case_id", activity: "activity", timestamp: "timestamp_end" }, timeFormat: "YYYY-MM-DD HH:mm:ss", timezone: "UTC", labels: [],
  createdBy: "u", createdAt: "2026-01-01T00:00:00Z", ...over,
});

// Hand-built log: each case = list of [activity, offset in ms from case start].
function mk(cases: [string, number][][], activities?: string[]): EventLog {
  const acts = activities ?? [...new Set(cases.flatMap((c) => c.map(([a]) => a)))];
  return {
    activities: acts,
    source: { sourceId: "s-t", snapshotId: "sn-t", mappingVersion: 1 },
    cases: cases.map((c, i) => {
      const startMs = 1_000_000 * (i + 1);
      const events = c.map(([activity, off]) => ({ activity, activityRaw: activity, time: new Date(startMs + off).toISOString(), resource: "user_01" }));
      const endMs = startMs + c[c.length - 1][1];
      return { id: `C-${String(i + 1).padStart(4, "0")}`, events, startMs, endMs, durationMs: endMs - startMs };
    }),
  };
}

describe("processActivities", () => {
  const acts = processActivities(sn1, m1);
  it("seed: happy path order, each once, excluded label absent", () => {
    expect(acts).toEqual(SEED);
    expect(acts).not.toContain("Cancel Invoice Receipt");
    expect(acts.length).toBeLessThanOrEqual(8);
  });
  it("merges case/space/punctuation variants and keeps the most frequent spelling", () => {
    const sn = snap(["Pay Bill", "Pay Bill", "pay bill", "Pay  Bill.", "Ship Goods"]);
    const r = processActivities(sn, mapping());
    expect(r.filter((x) => x.toLowerCase().startsWith("pay")).length).toBe(1);
    expect(r).toContain("Ship Goods");
  });
  it("caps at 8 for a 10-activity fixture", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Aktivitas ${i + 1}`);
    expect(processActivities(snap(ten), mapping())).toHaveLength(8);
  });
  it("drops excluded labels and applies renames", () => {
    const sn = snap(["A one", "B two", "C three"]);
    const r = processActivities(sn, mapping({ labels: [{ raw: "B two", canonical: null }, { raw: "C three", canonical: "C renamed" }] }));
    expect(r.slice(0, 2)).toEqual(["A one", "C renamed"]);
    expect(r.map((x) => x.toLowerCase().trim())).not.toContain("b two");
  });
});

describe("buildEventLog", () => {
  const log = buildEventLog(sn1, m1)!;
  it("is deterministic", () => expect(buildEventLog(sn1, m1)).toEqual(log));
  it("case count = min(round(rows/6), 400)", () => {
    expect(log.cases).toHaveLength(400);
    expect(buildEventLog(snap(SEED), mapping())!.cases).toHaveLength(100);
    const small = snap(SEED, { stats: { ...snap(SEED).stats!, rows: 61 } });
    expect(buildEventLog(small, mapping())!.cases).toHaveLength(10);
  });
  it("events are time-ordered, durations consistent, ids unique C-0001", () => {
    for (const c of log.cases) {
      const t = c.events.map((e) => Date.parse(e.time));
      expect(t).toEqual([...t].sort((a, b) => a - b));
      expect(c.durationMs).toBeGreaterThanOrEqual(0);
      expect(c.endMs - c.startMs).toBe(c.durationMs);
      expect(c.startMs).toBe(t[0]);
      expect(c.endMs).toBe(t[t.length - 1]);
      expect(c.events.every((e) => /^user_0[1-4]$/.test(e.resource))).toBe(true);
    }
    const ids = log.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("C-0001");
    expect(ids.every((i) => /^C-\d{4}$/.test(i))).toBe(true);
  });
  it("case starts lie within timeFrom..timeTo", () => {
    const from = Date.parse(sn1.stats!.timeFrom), to = Date.parse(sn1.stats!.timeTo);
    for (const c of log.cases) expect(c.startMs >= from && c.startMs <= to).toBe(true);
  });
  it("uses the seed activities and mixes path patterns", () => {
    expect(log.activities).toEqual(SEED);
    const lens = new Set(log.cases.map((c) => c.events.length));
    expect(lens.size).toBeGreaterThan(1);
    expect(log.source).toEqual({ sourceId: "s-p2p-sap", snapshotId: "sn-1", mappingVersion: 1 });
  });
  it("gaps are between 1 hour and 18 days", () => {
    for (const c of log.cases) for (let i = 1; i < c.events.length; i++) {
      const g = Date.parse(c.events[i].time) - Date.parse(c.events[i - 1].time);
      expect(g).toBeGreaterThanOrEqual(HOUR);
      expect(g).toBeLessThanOrEqual(18 * DAY);
    }
  });
  it("returns null with fewer than 2 activities", () => {
    expect(buildEventLog(snap(["Only one"]), mapping())).toBeNull();
    expect(buildEventLog(snap([]), mapping())).toBeNull();
    expect(buildEventLog({ ...snap(SEED), stats: undefined }, mapping())).toBeNull();
  });
  it("hostile activity strings pass through unchanged", () => {
    const l = buildEventLog(snap(["<script>x</script>", "Normal"]), mapping())!;
    expect(l.activities).toContain("<script>x</script>");
    expect(l.cases[0].events[0].activity).toBe("<script>x</script>");
  });
});

describe("buildDfg on a hand-built log", () => {
  const log = mk([
    [["A", 0], ["B", 1 * HOUR], ["C", 3 * HOUR]],
    [["A", 0], ["B", 3 * HOUR], ["B", 8 * HOUR], ["C", 12 * HOUR]],
    [["A", 0], ["C", 10 * HOUR]],
  ]);
  const dfg = buildDfg(log);
  const edge = (a: string, b: string) => dfg.edges.find((e) => e.id === `${a}→${b}`)!;
  it("counts and case counts per edge", () => {
    expect(dfg.totalCases).toBe(3);
    expect(edge("A", "B")).toMatchObject({ count: 2, caseCount: 2 });
    expect(edge("B", "B")).toMatchObject({ count: 1, caseCount: 1 });
    expect(edge("B", "C")).toMatchObject({ count: 2, caseCount: 2 });
    expect(edge("A", "C")).toMatchObject({ count: 1, caseCount: 1 });
    expect(edge(START_ID, "A")).toMatchObject({ count: 3, caseCount: 3 });
    expect(edge("C", END_ID)).toMatchObject({ count: 3, caseCount: 3 });
    expect(dfg.edges).toHaveLength(6);
  });
  it("median and p90 from known gaps (linear interpolation)", () => {
    expect(edge("A", "B").medianMs).toBe(2 * HOUR);
    expect(edge("A", "B").p90Ms).toBeCloseTo(2.8 * HOUR, 0);
    expect(edge("B", "C").medianMs).toBe(3 * HOUR);
    expect(edge("B", "C").p90Ms).toBeCloseTo(3.8 * HOUR, 0);
    expect(edge("B", "B")).toMatchObject({ medianMs: 5 * HOUR, p90Ms: 5 * HOUR });
    expect(edge("A", "C")).toMatchObject({ medianMs: 10 * HOUR, p90Ms: 10 * HOUR });
  });
  it("start/end edges have zero gap, never NaN", () => {
    expect(edge(START_ID, "A")).toMatchObject({ medianMs: 0, p90Ms: 0 });
    expect(edge("C", END_ID)).toMatchObject({ medianMs: 0, p90Ms: 0 });
    for (const e of dfg.edges) { expect(Number.isFinite(e.medianMs)).toBe(true); expect(Number.isFinite(e.p90Ms)).toBe(true); }
  });
  it("nodes: start/end with totalCases, activity counts", () => {
    const n = (id: string) => dfg.nodes.find((x) => x.id === id)!;
    expect(n(START_ID)).toMatchObject({ label: "Mulai", caseCount: 3, eventCount: 3 });
    expect(n(END_ID)).toMatchObject({ label: "Selesai", caseCount: 3, eventCount: 3 });
    expect(n("A")).toMatchObject({ caseCount: 3, eventCount: 3 });
    expect(n("B")).toMatchObject({ caseCount: 2, eventCount: 3 });
    expect(n("C")).toMatchObject({ caseCount: 3, eventCount: 3 });
  });
  it("both directions are separate edges", () => {
    const d = buildDfg(mk([[["A", 0], ["B", HOUR]], [["B", 0], ["A", 2 * HOUR]]]));
    expect(d.edges.find((e) => e.id === "A→B")).toMatchObject({ count: 1, medianMs: HOUR });
    expect(d.edges.find((e) => e.id === "B→A")).toMatchObject({ count: 1, medianMs: 2 * HOUR });
  });
  it("single-event case yields only start->a and a->end", () => {
    const d = buildDfg(mk([[["A", 0]]]));
    expect(d.edges.map((e) => e.id).sort()).toEqual([`${START_ID}→A`, `A→${END_ID}`].sort());
  });
  it("one and two samples are not NaN", () => {
    const d = buildDfg(mk([[["A", 0], ["B", HOUR]], [["A", 0], ["B", 3 * HOUR]]]));
    const e = d.edges.find((x) => x.id === "A→B")!;
    expect(e.medianMs).toBe(2 * HOUR);
    expect(e.p90Ms).toBeCloseTo(2.8 * HOUR, 0);
  });
  it("hostile label passes through whole", () => {
    const d = buildDfg(mk([[["<script>x</script>", 0], ["B", HOUR]]]));
    expect(d.nodes.map((n) => n.id)).toContain("<script>x</script>");
    expect(d.nodes.find((n) => n.id === "<script>x</script>")!.label).toBe("<script>x</script>");
    expect(d.edges.map((e) => e.id)).toContain("<script>x</script>→B");
  });
});

describe("map <-> cases consistency on the seed log", () => {
  const log = buildEventLog(sn1, m1)!;
  const dfg = buildDfg(log);
  it("every node caseCount equals casesForNode length", () => {
    for (const n of dfg.nodes) expect(casesForNode(log, n.id)).toHaveLength(n.caseCount);
  });
  it("every edge caseCount equals casesForEdge length", () => {
    for (const e of dfg.edges) expect(casesForEdge(log, e.from, e.to)).toHaveLength(e.caseCount);
  });
  it("sum of edge counts = consecutive pairs + 2 x cases; caseCount <= totalCases", () => {
    const pairs = log.cases.reduce((n, c) => n + Math.max(0, c.events.length - 1), 0);
    expect(dfg.edges.reduce((n, e) => n + e.count, 0)).toBe(pairs + 2 * log.cases.length);
    expect(dfg.totalCases).toBe(log.cases.length);
    for (const x of [...dfg.nodes, ...dfg.edges]) expect(x.caseCount).toBeLessThanOrEqual(dfg.totalCases);
  });
  it("start/end return all cases", () => {
    expect(casesForNode(log, START_ID)).toHaveLength(log.cases.length);
    expect(casesForNode(log, END_ID)).toHaveLength(log.cases.length);
  });
  it("the seed has the intentional bottleneck (2nd -> 3rd activity is slowest)", () => {
    const slowest = [...dfg.edges].sort((a, b) => b.medianMs - a.medianMs)[0];
    expect(slowest.id).toBe(`${SEED[1]}→${SEED[2]}`);
  });
});

describe("simplify", () => {
  const log = buildEventLog(sn1, m1)!;
  const dfg = buildDfg(log);
  const acts = dfg.nodes.length - 2;
  it("100/100 hides nothing", () => {
    const r = simplify(dfg, { activityPct: 100, transitionPct: 100 });
    expect(r).toMatchObject({ hiddenActivities: 0, hiddenTransitions: 0 });
    expect(r.nodes).toHaveLength(dfg.nodes.length);
    expect(r.edges).toHaveLength(dfg.edges.length);
  });
  it("1/1 keeps start/end plus the top activity, drops edges with hidden ends", () => {
    const r = simplify(dfg, { activityPct: 1, transitionPct: 1 });
    const kept = r.nodes.filter((n) => n.id !== START_ID && n.id !== END_ID);
    expect(kept).toHaveLength(Math.max(1, Math.ceil(acts / 100)));
    expect(r.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([START_ID, END_ID]));
    expect(r.hiddenActivities).toBe(acts - kept.length);
    const ids = new Set(r.nodes.map((n) => n.id));
    expect(r.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(r.hiddenTransitions).toBe(dfg.edges.length - r.edges.length);
  });
  it("keeps activities by eventCount, ties by name", () => {
    const d = buildDfg(mk([[["B", 0], ["A", HOUR], ["C", 2 * HOUR], ["C", 3 * HOUR]]]));
    const r = simplify(d, { activityPct: 66, transitionPct: 100 });
    expect(r.nodes.filter((n) => n.id !== START_ID && n.id !== END_ID).map((n) => n.id).sort()).toEqual(["A", "C"]);
  });
  it("transitionPct keeps the highest-count edges", () => {
    const d = buildDfg(mk([[["A", 0], ["B", HOUR]], [["A", 0], ["B", HOUR]], [["A", 0], ["C", HOUR]]]));
    const r = simplify(d, { activityPct: 100, transitionPct: 34 });
    expect(r.edges).toHaveLength(Math.ceil(0.34 * d.edges.length));
    expect(r.edges[0].count).toBe(3);
  });
  it("defaultSimplify keeps about 30 of 45 activities and everything when small", () => {
    expect(defaultSimplify(dfg)).toEqual({ activityPct: 100, transitionPct: 100 });
    const names = Array.from({ length: 45 }, (_, i) => `Act ${String(i).padStart(2, "0")}`);
    const big = buildDfg(mk([names.map((n, i) => [n, i * HOUR] as [string, number])]));
    const d = defaultSimplify(big);
    expect(d.transitionPct).toBe(100);
    const r = simplify(big, d);
    const kept = r.nodes.length - 2;
    expect(kept).toBeGreaterThanOrEqual(30);
    expect(kept).toBeLessThanOrEqual(31);
  });
});

describe("sortCases / pageOf", () => {
  const cs: LogCase[] = [
    { id: "a", events: [1, 2, 3].map(() => ({ activity: "x", activityRaw: "x", time: "", resource: "" })), startMs: 30, endMs: 40, durationMs: 10 },
    { id: "b", events: [1].map(() => ({ activity: "x", activityRaw: "x", time: "", resource: "" })), startMs: 10, endMs: 60, durationMs: 50 },
    { id: "c", events: [1, 2, 3].map(() => ({ activity: "x", activityRaw: "x", time: "", resource: "" })), startMs: 20, endMs: 30, durationMs: 10 },
  ];
  const ids = (x: LogCase[]) => x.map((c) => c.id);
  it("sorts by the three keys in both directions", () => {
    expect(ids(sortCases(cs, "durasi", "desc"))).toEqual(["b", "a", "c"]);
    expect(ids(sortCases(cs, "durasi", "asc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortCases(cs, "mulai", "asc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortCases(cs, "mulai", "desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortCases(cs, "event", "desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortCases(cs, "event", "asc"))).toEqual(["b", "a", "c"]);
  });
  it("is stable for ties and does not mutate", () => {
    const before = ids(cs);
    sortCases(cs, "durasi", "desc");
    expect(ids(cs)).toEqual(before);
  });
  const items = Array.from({ length: 45 }, (_, i) => i);
  it("pages", () => {
    expect(pageOf(items, 1, 20)).toMatchObject({ pages: 3, page: 1 });
    expect(pageOf(items, 1, 20).items).toHaveLength(20);
    expect(pageOf(items, 3, 20).items).toEqual([40, 41, 42, 43, 44]);
  });
  it("clamps out-of-range pages and tiny sizes", () => {
    expect(pageOf(items, 99, 20).page).toBe(3);
    expect(pageOf(items, 0, 20).page).toBe(1);
    expect(pageOf(items, -4, 20).page).toBe(1);
    expect(pageOf(items, 1, 0).items).toHaveLength(1);
    expect(pageOf([], 5, 20)).toEqual({ items: [], pages: 1, page: 1 });
  });
});

describe("eventLogFor", () => {
  it("returns the log for a project with a mapping", () => {
    const r = eventLogFor(s, "p-p2p")!;
    expect(r).not.toBeNull();
    expect(r.sourceLabel).toContain("Ekspor SAP P2P");
    expect(r.sourceLabel).toBe("Ekspor SAP P2P · pemetaan v1");
    expect(r.mappingVersion).toBeGreaterThanOrEqual(1);
    expect(r.hasStartTime).toBe(false);
    expect(r.dfg.totalCases).toBe(r.log.cases.length);
  });
  it("hasStartTime when a timestamp_start column is mapped", () => {
    const st = { ...s, mappings: [{ ...m1, id: "m-start", roles: { ...m1.roles, started: "timestamp_start" as const } }] };
    expect(eventLogFor(st, "p-p2p")!.hasStartTime).toBe(true);
  });
  it("returns null without a mapping", () => {
    expect(eventLogFor({ ...s, mappings: [] }, "p-p2p")).toBeNull();
    expect(eventLogFor(s, "p-nonexistent")).toBeNull();
  });
  it("memoizes per snapshot and mapping", () => {
    expect(eventLogFor(s, "p-p2p")!.log).toBe(eventLogFor(s, "p-p2p")!.log);
  });
});
