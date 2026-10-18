import { describe, expect, it } from "vitest";
import { initialState as s } from "./data";
import { buildDfg, casesForNode, eventLogFor, type EventLog, type LogCase } from "./eventlog";
import {
  applyFilter, buildVariants, caseById, casesForSelection, describeFilter, eventGaps, filteredLogFor, groupCases, isEmptyFilter, mergedTimeline, normalizeFilter, objectGroups, provenance,
  validateFilter, variantIdOf, variantsTo80, VENDORS, type FilterSpec,
} from "./analysis";

const DAY = 86_400_000;
const D0 = Date.UTC(2026, 4, 1); // 2026-05-01

interface C { id?: string; acts: string[]; start?: number; days?: number; vendor?: string; po?: string; complete?: boolean; flags?: (string | undefined)[] }
// Hand-built log: events spread evenly over `days` from start.
function mk(cases: C[]): EventLog {
  return {
    activities: [...new Set(cases.flatMap((c) => c.acts))],
    source: { sourceId: "s", snapshotId: "n", mappingVersion: 1 },
    cases: cases.map((c, i): LogCase => {
      const startMs = c.start ?? D0 + i * DAY;
      const span = (c.days ?? 2) * DAY;
      const events = c.acts.map((activity, j) => ({
        activity, activityRaw: activity, resource: "r", rowRef: 2 + j,
        time: new Date(startMs + (c.acts.length === 1 ? 0 : (span * j) / (c.acts.length - 1))).toISOString(),
        ...(c.flags?.[j] ? { flag: c.flags[j] as "ambigu" } : {}),
      }));
      return {
        id: c.id ?? `C-${String(i + 1).padStart(4, "0")}`, events, startMs, endMs: Date.parse(events[events.length - 1].time), durationMs: Date.parse(events[events.length - 1].time) - startMs,
        attrs: { vendor: c.vendor ?? VENDORS[0] }, objects: { po: c.po ?? "PO-4500001" }, complete: c.complete ?? true,
      };
    }),
  };
}
const ids = (l: EventLog) => l.cases.map((c) => c.id);

describe("variants", () => {
  const log = mk([{ acts: ["A", "B", "C"] }, { acts: ["A", "B", "C"] }, { acts: ["A", "C"] }, { acts: ["A", "B", "B", "C"] }, { acts: ["A", "C"] }, { acts: ["A", "B", "C"] }]);
  const v = buildVariants(log);
  it("orders by caseCount desc, ties by sequence", () => {
    expect(v.map((x) => x.sequence.join("→"))).toEqual(["A→B→C", "A→C", "A→B→B→C"]);
    expect(v.map((x) => x.caseCount)).toEqual([3, 2, 1]);
  });
  it("pct/cumPct, final cumPct = 100, counts sum to cases", () => {
    expect(v[0].pct).toBe(50);
    expect(v[1].cumPct).toBeCloseTo(83.33, 1);
    expect(v[v.length - 1].cumPct).toBe(100);
    expect(v.reduce((n, x) => n + x.caseCount, 0)).toBe(log.cases.length);
  });
  it("ids are stable and match variantIdOf", () => {
    expect(v[0].id).toMatch(/^v-[0-9a-f]{8}$/);
    expect(variantIdOf(["A", "B", "C"])).toBe(v[0].id);
    expect(buildVariants(log).map((x) => x.id)).toEqual(v.map((x) => x.id));
    expect(variantIdOf(["A", "B"])).not.toBe(variantIdOf(["A", "B", "B"]));
  });
  it("median duration from members", () => {
    const m = buildVariants(mk([{ acts: ["A", "B"], days: 1 }, { acts: ["A", "B"], days: 3 }, { acts: ["A", "B"], days: 9 }]));
    expect(m[0].medianDurationMs).toBe(3 * DAY);
  });
  it("ambiguous when a member has an ambigu event", () => {
    const a = buildVariants(mk([{ acts: ["A", "B"], flags: [undefined, "ambigu"] }, { acts: ["A", "B"] }, { acts: ["A", "C"] }]));
    expect(a.find((x) => x.sequence.join() === "A,B")!.ambiguous).toBe(true);
    expect(a.find((x) => x.sequence.join() === "A,C")!.ambiguous).toBe(false);
  });
  it("empty log -> []", () => {
    expect(buildVariants(mk([]))).toEqual([]);
    expect(variantsTo80([])).toBe(0);
  });
  it("activity labels like __proto__ / constructor group correctly", () => {
    const w = buildVariants(mk([{ acts: ["__proto__", "constructor"] }, { acts: ["__proto__", "constructor"] }, { acts: ["toString"] }]));
    expect(w.map((x) => x.caseCount)).toEqual([2, 1]);
  });
  it("variantsTo80", () => {
    expect(variantsTo80(v)).toBe(2); // 50, 83.3
    expect(variantsTo80(buildVariants(mk([{ acts: ["A"] }])))).toBe(1);
  });
  it("does not mutate the log", () => {
    const before = JSON.stringify(log);
    buildVariants(log);
    expect(JSON.stringify(log)).toBe(before);
  });
});

describe("applyFilter", () => {
  const log = mk([
    { id: "a", acts: ["A", "B", "C"], start: D0, days: 2, vendor: "V1", po: "PO-1", complete: true },
    { id: "b", acts: ["A", "C"], start: D0 + 10 * DAY, days: 10, vendor: "V2", po: "PO-1", complete: false },
    { id: "c", acts: ["A", "B", "C"], start: D0 + 20 * DAY, days: 4, vendor: "V1", po: "PO-2", complete: true },
    { id: "d", acts: ["A", "D"], start: D0 + 30 * DAY, days: 1, vendor: "V3", po: "PO-3", complete: false },
  ]);
  const f = (spec: FilterSpec) => ids(applyFilter(log, spec));
  it("empty filter returns identical cases (same log)", () => {
    expect(applyFilter(log, {})).toBe(log);
    expect(applyFilter(log, { vendors: [], hasActivities: [], lacksActivities: [], variantIds: [], po: "", completion: "semua" })).toEqual(log);
  });
  it("period by mulai, inclusive days", () => {
    expect(f({ period: { by: "mulai", from: "2026-05-11", to: "2026-05-21" } })).toEqual(["b", "c"]);
    expect(f({ period: { by: "mulai", from: "2026-05-11", to: "2026-05-11" } })).toEqual(["b"]); // single day, inclusive
    expect(f({ period: { by: "mulai", from: "2026-05-21" } })).toEqual(["c", "d"]);
    expect(f({ period: { by: "mulai", to: "2026-05-01" } })).toEqual(["a"]);
  });
  it("period by akhir and event", () => {
    expect(f({ period: { by: "akhir", from: "2026-05-02", to: "2026-05-03" } })).toEqual(["a"]);
    expect(f({ period: { by: "event", from: "2026-05-15", to: "2026-05-18" } })).toEqual([]); // b spans these days but has no event in them
    expect(f({ period: { by: "event", from: "2026-05-21", to: "2026-05-21" } })).toEqual(["b", "c"]);
    expect(f({ period: { by: "event", from: "2026-04-01", to: "2026-04-30" } })).toEqual([]);
  });
  it("vendors, activities, completion, po", () => {
    expect(f({ vendors: ["V1"] })).toEqual(["a", "c"]);
    expect(f({ vendors: ["V1", "V3"] })).toEqual(["a", "c", "d"]);
    expect(f({ hasActivities: ["B"] })).toEqual(["a", "c"]);
    expect(f({ hasActivities: ["A", "D"] })).toEqual(["d"]);
    expect(f({ lacksActivities: ["B", "D"] })).toEqual(["b"]);
    expect(f({ completion: "selesai" })).toEqual(["a", "c"]);
    expect(f({ completion: "berjalan" })).toEqual(["b", "d"]);
    expect(f({ po: "PO-1" })).toEqual(["a", "b"]);
    expect(f({ po: "PO" })).toEqual([]);
  });
  it("variantIds", () => {
    expect(f({ variantIds: [variantIdOf(["A", "B", "C"])] })).toEqual(["a", "c"]);
    expect(f({ variantIds: ["v-00000000"] })).toEqual([]);
  });
  it("duration in days", () => {
    expect(f({ duration: { minDays: 4 } })).toEqual(["b", "c"]);
    expect(f({ duration: { maxDays: 2 } })).toEqual(["a", "d"]);
    expect(f({ duration: { minDays: 2, maxDays: 4 } })).toEqual(["a", "c"]);
    expect(f({ duration: { minDays: 5, maxDays: 3 } })).toEqual([]);
    expect(f({ duration: { minDays: 0 } })).toEqual(["a", "b", "c", "d"]);
  });
  it("AND combination equals sequential application", () => {
    const spec: FilterSpec = { vendors: ["V1"], completion: "selesai", hasActivities: ["B"], duration: { maxDays: 3 } };
    expect(f(spec)).toEqual(["a"]);
    const stepwise = applyFilter(applyFilter(applyFilter(log, { vendors: ["V1"] }), { completion: "selesai" }), { hasActivities: ["B"], duration: { maxDays: 3 } });
    expect(ids(stepwise)).toEqual(f(spec));
  });
  it("keeps activities, source and case order; does not mutate", () => {
    const before = JSON.stringify(log);
    const r = applyFilter(log, { vendors: ["V1", "V3"] });
    expect(r.activities).toEqual(log.activities);
    expect(r.source).toEqual(log.source);
    expect(JSON.stringify(log)).toBe(before);
  });
  it("garbage dates/numbers do not throw and do not filter", () => {
    expect(f({ period: { by: "mulai", from: "nope" }, duration: { minDays: NaN } })).toEqual(["a", "b", "c", "d"]);
  });
  it("vendor named like a prototype key is matched literally", () => {
    const l = mk([{ acts: ["A"], vendor: "constructor" }, { acts: ["A"], vendor: "x" }]);
    expect(ids(applyFilter(l, { vendors: ["constructor"] }))).toEqual(["C-0001"]);
    expect(ids(applyFilter(l, { vendors: ["__proto__"] }))).toEqual([]);
  });
});

describe("validate / describe / normalize", () => {
  it("valid and empty specs have no errors", () => {
    expect(validateFilter({})).toEqual([]);
    expect(validateFilter({ period: { by: "mulai", from: "2026-05-01", to: "2026-05-01" }, duration: { minDays: 0, maxDays: 3 } })).toEqual([]);
  });
  it("flags reversed dates, bad dates, negative/NaN durations (Indonesian messages)", () => {
    expect(validateFilter({ period: { by: "mulai", from: "2026-06-01", to: "2026-05-01" } })).toEqual(["Tanggal mulai tidak boleh setelah tanggal akhir"]);
    expect(validateFilter({ period: { by: "mulai", from: "31/05/2026" } })).toHaveLength(1);
    expect(validateFilter({ period: { by: "mulai", to: "2026-02-31" } })).toHaveLength(1);
    expect(validateFilter({ duration: { minDays: -1 } })).toEqual(["Durasi minimal tidak boleh negatif"]);
    expect(validateFilter({ duration: { maxDays: NaN } })).toEqual(["Durasi maksimal harus berupa angka"]);
    expect(validateFilter({ duration: { minDays: -1, maxDays: -2 } })).toHaveLength(2);
  });
  it("impossible calendar dates give an error message, never throw", () => {
    for (const bad of ["2026-13-01", "2026-00-10", "0000-00-00"]) {
      expect(() => validateFilter({ period: { by: "mulai", from: bad } })).not.toThrow();
      expect(validateFilter({ period: { by: "mulai", from: bad } })).toHaveLength(1);
      expect(validateFilter({ period: { by: "event", to: bad } })).toHaveLength(1);
      const l = mk([{ acts: ["A", "B"] }]);
      expect(() => applyFilter(l, { period: { by: "mulai", from: bad, to: bad } })).not.toThrow();
      expect(ids(applyFilter(l, { period: { by: "mulai", from: bad } }))).toEqual(["C-0001"]); // bad bound is ignored
      expect(() => filteredLogFor(s, "p-p2p", { period: { by: "akhir", to: bad } })).not.toThrow();
    }
  });
  it("normalize drops NaN durations; describe skips invalid bounds", () => {
    expect(isEmptyFilter({ duration: { minDays: NaN } })).toBe(true);
    expect(normalizeFilter({ duration: { minDays: NaN, maxDays: 3 } })).toEqual({ duration: { maxDays: 3 } });
    expect(JSON.stringify(normalizeFilter({ duration: { maxDays: NaN } }))).toBe("{}");
    expect(describeFilter({ period: { by: "mulai", from: "2026-13-01" } })).toEqual([]);
    expect(describeFilter({ period: { by: "mulai", from: "2026-13-01", to: "2026-07-31" } })).toEqual(["Periode: kasus mulai sampai 31 Jul 2026"]);
    expect(describeFilter({ duration: { minDays: NaN } })).toEqual([]);
  });
  it("isEmptyFilter / normalizeFilter drop empty keys and sort arrays", () => {
    expect(isEmptyFilter({})).toBe(true);
    expect(isEmptyFilter({ vendors: [], period: { by: "akhir" }, po: "  ", completion: "semua", duration: {} })).toBe(true);
    expect(isEmptyFilter({ vendors: ["V"] })).toBe(false);
    const a = normalizeFilter({ vendors: ["b", "a", "a"], hasActivities: ["Z", "Y"], po: " PO-1 ", completion: "semua", lacksActivities: [] });
    expect(a).toEqual({ vendors: ["a", "b"], hasActivities: ["Y", "Z"], po: "PO-1" });
    expect(JSON.stringify(normalizeFilter({ vendors: ["a", "b"] }))).toBe(JSON.stringify(normalizeFilter({ vendors: ["b", "a"] })));
  });
  it("normalize does not mutate and does not touch the input arrays", () => {
    const v = ["b", "a"];
    normalizeFilter({ vendors: v });
    expect(v).toEqual(["b", "a"]);
  });
  it("describeFilter: none for empty, Indonesian sentences otherwise", () => {
    expect(describeFilter({})).toEqual([]);
    const d = describeFilter({
      period: { by: "mulai", from: "2026-05-01", to: "2026-07-31" }, vendors: ["PT A", "PT B"], hasActivities: ["X"], lacksActivities: ["Y"],
      variantIds: ["v-1"], duration: { minDays: 3, maxDays: 10 }, completion: "berjalan", po: "PO-1",
    });
    expect(d).toEqual([
      "Periode: kasus mulai 1 Mei–31 Jul 2026",
      "Vendor: PT A, PT B",
      "Harus memuat aktivitas: X",
      "Tidak boleh memuat aktivitas: Y",
      "Varian: 1 dipilih",
      "Durasi: 3–10 hari",
      "Status: berjalan",
      "Nomor PO: PO-1",
    ]);
    expect(describeFilter({ period: { by: "event", from: "2025-12-01", to: "2026-01-15" } })[0]).toBe("Periode: ada event 1 Des 2025–15 Jan 2026");
    expect(describeFilter({ duration: { minDays: 3 } })).toEqual(["Durasi: minimal 3 hari"]);
    expect(describeFilter({ duration: { maxDays: 3 } })).toEqual(["Durasi: maksimal 3 hari"]);
  });
  it("describeFilter is order-stable", () => {
    expect(describeFilter({ vendors: ["b", "a"] })).toEqual(describeFilter({ vendors: ["a", "b"] }));
  });
});

describe("objects", () => {
  const log = mk([
    { id: "a", acts: ["A", "B"], po: "PO-2", start: D0 + 3 * DAY },
    { id: "b", acts: ["A", "B"], po: "PO-1", start: D0 },
    { id: "c", acts: ["A", "C"], po: "PO-2", start: D0 + 1 * DAY },
    { id: "d", acts: ["A", "B"], po: "PO-3", start: D0 + 9 * DAY },
    { id: "e", acts: ["A", "B"], po: "constructor", start: D0 + 9 * DAY },
  ]);
  const g = objectGroups(log);
  it("sorted by caseCount desc then id, with range and variants", () => {
    expect(g.map((x) => x.id)).toEqual(["PO-2", "PO-1", "PO-3", "constructor"]);
    const po2 = g[0];
    expect(po2.caseIds).toEqual(["a", "c"]);
    expect(po2.caseCount).toBe(2);
    expect(po2.fromMs).toBe(D0 + DAY);
    expect(po2.toMs).toBe(Math.max(log.cases[0].endMs, log.cases[2].endMs));
    expect(po2.variantIds).toHaveLength(2);
    expect(g[3].caseIds).toEqual(["e"]);
  });
  it("groupCases / caseById", () => {
    expect(groupCases(log, "PO-2").map((c) => c.id)).toEqual(["a", "c"]);
    expect(groupCases(log, "PO-9")).toEqual([]);
    expect(caseById(log, "d")!.id).toBe("d");
    expect(caseById(log, "zzz")).toBeUndefined();
    expect(caseById(log, "constructor")).toBeUndefined();
  });
  it("empty log", () => expect(objectGroups(mk([]))).toEqual([]));
});

describe("mergedTimeline", () => {
  const cases = () => mk([
    { id: "b", acts: ["A", "B", "C"], po: "PO-1", start: D0 + DAY, days: 2 },
    { id: "a", acts: ["A", "B"], po: "PO-1", start: D0, days: 1 },
    { id: "c", acts: ["X"], po: "PO-1", start: D0 + DAY },
  ]).cases;
  it("one row per event across all cases, time non-decreasing", () => {
    const rows = mergedTimeline(cases());
    expect(rows).toHaveLength(6);
    for (let i = 1; i < rows.length; i++) expect(Date.parse(rows[i].event.time)).toBeGreaterThanOrEqual(Date.parse(rows[i - 1].event.time));
  });
  it("ties ordered by caseId then index", () => {
    // a.B, b.A and c.X all at D0 + DAY
    const rows = mergedTimeline(cases());
    expect(rows.map((r) => `${r.caseId}${r.index}`)).toEqual(["a0", "a1", "b0", "c0", "b1", "b2"]);
  });
  it("deterministic regardless of input order, does not mutate", () => {
    const cs = cases();
    const before = JSON.stringify(cs);
    const fwd = mergedTimeline(cs), rev = mergedTimeline([...cs].reverse());
    expect(rev).toEqual(fwd);
    expect(JSON.stringify(cs)).toBe(before);
  });
  it("empty input gives []", () => expect(mergedTimeline([])).toEqual([]));
});

describe("provenance", () => {
  it("maps event to file, row and mapping version", () => {
    const r = eventLogFor(s, "p-p2p")!;
    const ev = r.log.cases[0].events[0];
    expect(provenance(r.snapshot, r.mapping, ev)).toEqual({ fileName: "sap_p2p_okt2026.csv", rowRef: ev.rowRef, mappingVersion: 1 });
  });
});

describe("filteredLogFor", () => {
  it("null when the project has no data", () => {
    expect(filteredLogFor(s, "p-nonexistent", {})).toBeNull();
    expect(filteredLogFor({ ...s, mappings: [] }, "p-p2p", {})).toBeNull();
  });
  it("empty filter equals M05a: same log, dfg, plus metadata", () => {
    const base = eventLogFor(s, "p-p2p")!;
    const r = filteredLogFor(s, "p-p2p", {})!;
    expect(r.filtered).toBe(r.full);
    expect(r.full).toBe(base.log);
    expect(r.dfg).toEqual(buildDfg(r.full));
    expect(r.variants).toEqual(buildVariants(r.full));
    expect(r.sourceLabel).toBe(base.sourceLabel);
    expect(r.mappingVersion).toBe(1);
    expect(r.hasStartTime).toBe(false);
    expect(r.attrsAvailable).toBe(true);
    expect(r.snapshot.id).toBe("sn-1");
    expect(r.mapping.id).toBe("m-1");
  });
  it("memoizes: equivalent specs give the same reference", () => {
    const a = filteredLogFor(s, "p-p2p", { vendors: [VENDORS[1], VENDORS[0]], completion: "semua" })!;
    const b = filteredLogFor(s, "p-p2p", { vendors: [VENDORS[0], VENDORS[1]] })!;
    expect(a).toBe(b);
    expect(filteredLogFor(s, "p-p2p", { vendors: [VENDORS[0]] })).not.toBe(a);
  });
  it("seed invariants with a vendor filter", () => {
    const r = filteredLogFor(s, "p-p2p", { vendors: [VENDORS[2]] })!;
    expect(r.filtered.cases.length).toBeGreaterThan(0);
    expect(r.filtered.cases.length).toBeLessThan(r.full.cases.length);
    expect(r.filtered.cases.every((c) => c.attrs.vendor === VENDORS[2])).toBe(true);
    expect(r.variants.reduce((n, v) => n + v.caseCount, 0)).toBe(r.filtered.cases.length);
    expect(r.variants[r.variants.length - 1].cumPct).toBe(100);
    expect(r.dfg.totalCases).toBe(r.filtered.cases.length);
    for (const n of r.dfg.nodes) expect(casesForNode(r.filtered, n.id).length).toBe(n.caseCount);
  });
  it("filtering one variant yields exactly its caseCount", () => {
    const full = filteredLogFor(s, "p-p2p", {})!;
    const v = full.variants[1];
    const r = filteredLogFor(s, "p-p2p", { variantIds: [v.id] })!;
    expect(r.filtered.cases).toHaveLength(v.caseCount);
    expect(r.variants).toHaveLength(1);
  });
  it("a filter matching nothing gives an empty, well-formed result", () => {
    const r = filteredLogFor(s, "p-p2p", { po: "PO-none" })!;
    expect(r.filtered.cases).toEqual([]);
    expect(r.variants).toEqual([]);
    expect(r.dfg.totalCases).toBe(0);
    expect(r.full.cases.length).toBeGreaterThan(0);
  });
});

describe("casesForSelection", () => {
  const r = filteredLogFor(s, "p-p2p", { vendors: [VENDORS[1]] })!;
  it("node / edge / variant counts equal the element's own number", () => {
    expect(r.dfg.nodes.length).toBeGreaterThan(2);
    for (const n of r.dfg.nodes) expect(casesForSelection(r.filtered, r.dfg, { kind: "node", id: n.id })).toHaveLength(n.caseCount);
    for (const e of r.dfg.edges) expect(casesForSelection(r.filtered, r.dfg, { kind: "edge", id: e.id })).toHaveLength(e.caseCount);
    for (const v of r.variants) expect(casesForSelection(r.filtered, r.dfg, { kind: "variant", id: v.id })).toHaveLength(v.caseCount);
  });
  it("unknown id gives [] and no selection gives every case", () => {
    for (const kind of ["node", "edge", "variant"] as const) expect(casesForSelection(r.filtered, r.dfg, { kind, id: "nope" })).toEqual([]);
    expect(casesForSelection(r.filtered, r.dfg, null)).toHaveLength(r.filtered.cases.length);
  });
});

describe("eventGaps", () => {
  it("first is null, others the ms difference to the previous event", () => {
    const c = mk([{ acts: ["A", "B", "C"], days: 2 }]).cases[0];
    expect(eventGaps(c)).toEqual([null, DAY, DAY]);
  });
  it("never negative even when events are out of order; single event gives [null]", () => {
    const c = mk([{ acts: ["A", "B"] }]).cases[0];
    c.events = [c.events[1], c.events[0]];
    expect(eventGaps(c)).toEqual([null, 0]);
    expect(eventGaps(mk([{ acts: ["A"] }]).cases[0])).toEqual([null]);
  });
  it("seed log: same length as events, no negatives", () => {
    for (const c of filteredLogFor(s, "p-p2p", {})!.full.cases.slice(0, 50)) {
      const g = eventGaps(c);
      expect(g).toHaveLength(c.events.length);
      expect(g.slice(1).every((x) => x !== null && x >= 0)).toBe(true);
    }
  });
});
