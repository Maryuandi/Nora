import { buildDfg, casesForEdge, casesForNode, eventLogFor, percentile, VENDORS, type Dfg, type EventLog, type LogCase, type LogEvent } from "./eventlog";
import { hash } from "./mapping";
import type { MappingVersion, MockState, Snapshot } from "./types";

export { VENDORS };

const DAY = 86_400_000;

export interface Variant {
  id: string; sequence: string[]; caseCount: number; pct: number; cumPct: number; medianDurationMs: number; ambiguous: boolean;
}
export interface FilterSpec {
  period?: { by: "mulai" | "akhir" | "event"; from?: string; to?: string };
  vendors?: string[];
  hasActivities?: string[]; lacksActivities?: string[];
  variantIds?: string[];
  duration?: { minDays?: number; maxDays?: number };
  completion?: "semua" | "selesai" | "berjalan";
  po?: string;
}
export interface ObjectGroup { id: string; caseIds: string[]; caseCount: number; fromMs: number; toMs: number; variantIds: string[] }
export interface FilteredResult {
  full: EventLog; filtered: EventLog; dfg: Dfg; variants: Variant[]; sourceLabel: string; mappingVersion: number;
  hasStartTime: boolean; attrsAvailable: boolean; snapshot: Snapshot; mapping: MappingVersion;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---- variants ----
// shortcut: 32-bit FNV id, two different sequences could collide; fine for a mock log of <= 400 cases.
export function variantIdOf(sequence: string[]): string {
  return `v-${hash(JSON.stringify(sequence)).toString(16).padStart(8, "0")}`;
}

export function buildVariants(log: EventLog): Variant[] {
  const groups = new Map<string, { sequence: string[]; cases: LogCase[] }>();
  for (const c of log.cases) {
    const sequence = c.events.map((e) => e.activity);
    const key = JSON.stringify(sequence);
    const g = groups.get(key);
    if (g) g.cases.push(c); else groups.set(key, { sequence, cases: [c] });
  }
  const total = log.cases.length;
  let cum = 0;
  return [...groups.values()]
    .sort((a, b) => b.cases.length - a.cases.length || byText(a.sequence.join("→"), b.sequence.join("→")))
    .map(({ sequence, cases }) => {
      cum += cases.length;
      return {
        id: variantIdOf(sequence), sequence, caseCount: cases.length,
        pct: (cases.length * 100) / total, cumPct: (cum * 100) / total,
        medianDurationMs: percentile(cases.map((c) => c.durationMs).sort((a, b) => a - b), 0.5),
        ambiguous: cases.some((c) => c.events.some((e) => e.flag === "ambigu")),
      };
    });
}

export function variantsTo80(variants: Variant[]): number {
  const i = variants.findIndex((v) => v.cumPct >= 80);
  return i < 0 ? 0 : i + 1;
}

// ---- filter ----
// Date.parse first: toISOString throws on impossible dates such as 2026-13-01.
const isDay = (s: string | undefined): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const dayMs = (s: string | undefined) => (isDay(s) ? Date.parse(s) : NaN);
const num = (n: number | undefined) => typeof n === "number" && Number.isFinite(n);
const list = (a: string[] | undefined) => [...new Set(a ?? [])].sort(byText);

export function normalizeFilter(spec: FilterSpec): FilterSpec {
  const out: FilterSpec = {};
  const p = spec.period;
  const from = p?.from?.trim(), to = p?.to?.trim();
  if (p && (from || to)) out.period = { by: p.by, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  for (const k of ["vendors", "hasActivities", "lacksActivities", "variantIds"] as const) {
    const a = list(spec[k]);
    if (a.length > 0) out[k] = a;
  }
  const d = spec.duration;
  if (d && (num(d.minDays) || num(d.maxDays))) {
    out.duration = { ...(num(d.minDays) ? { minDays: d.minDays } : {}), ...(num(d.maxDays) ? { maxDays: d.maxDays } : {}) };
  }
  if (spec.completion === "selesai" || spec.completion === "berjalan") out.completion = spec.completion;
  const po = spec.po?.trim();
  if (po) out.po = po;
  return out;
}

export const isEmptyFilter = (spec: FilterSpec): boolean => Object.keys(normalizeFilter(spec)).length === 0;

export function validateFilter(spec: FilterSpec): string[] {
  const errors: string[] = [];
  const { from, to } = spec.period ?? {};
  if (from && !isDay(from.trim())) errors.push("Tanggal mulai tidak valid (format AAAA-BB-HH)");
  if (to && !isDay(to.trim())) errors.push("Tanggal akhir tidak valid (format AAAA-BB-HH)");
  if (isDay(from?.trim()) && isDay(to?.trim()) && dayMs(from!.trim()) > dayMs(to!.trim())) errors.push("Tanggal mulai tidak boleh setelah tanggal akhir");
  for (const [key, label] of [["minDays", "minimal"], ["maxDays", "maksimal"]] as const) {
    const v = spec.duration?.[key];
    if (v === undefined) continue;
    if (!num(v)) errors.push(`Durasi ${label} harus berupa angka`);
    else if (v < 0) errors.push(`Durasi ${label} tidak boleh negatif`);
  }
  return errors;
}

export function applyFilter(log: EventLog, spec: FilterSpec): EventLog {
  const f = normalizeFilter(spec);
  if (Object.keys(f).length === 0) return log;
  const fromMs = dayMs(f.period?.from);
  const toMs = dayMs(f.period?.to) + DAY - 1; // NaN stays NaN: an unparseable bound filters nothing
  const vendors = f.vendors && new Set(f.vendors);
  const variantIds = f.variantIds && new Set(f.variantIds);
  const minMs = num(f.duration?.minDays) ? f.duration!.minDays! * DAY : NaN;
  const maxMs = num(f.duration?.maxDays) ? f.duration!.maxDays! * DAY : NaN;
  const inRange = (ms: number) => !(ms < fromMs) && !(ms > toMs); // NaN bounds compare false -> pass

  const keep = (c: LogCase): boolean => {
    if (f.period) {
      const ok = f.period.by === "mulai" ? inRange(c.startMs) : f.period.by === "akhir" ? inRange(c.endMs) : c.events.some((e) => inRange(Date.parse(e.time)));
      if (!ok) return false;
    }
    if (vendors && !vendors.has(c.attrs.vendor)) return false;
    if (f.hasActivities || f.lacksActivities) {
      const acts = new Set(c.events.map((e) => e.activity));
      if (f.hasActivities && !f.hasActivities.every((a) => acts.has(a))) return false;
      if (f.lacksActivities && f.lacksActivities.some((a) => acts.has(a))) return false;
    }
    if (variantIds && !variantIds.has(variantIdOf(c.events.map((e) => e.activity)))) return false;
    if (c.durationMs < minMs || c.durationMs > maxMs) return false;
    if (f.completion && c.complete !== (f.completion === "selesai")) return false;
    if (f.po && c.objects.po !== f.po) return false;
    return true;
  };
  // minDays > maxDays is allowed and simply matches nothing.
  return { ...log, cases: log.cases.filter(keep) };
}

// ---- describe ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function dayParts(s: string) { const d = new Date(s); return { d: d.getUTCDate(), m: MONTHS[d.getUTCMonth()], y: d.getUTCFullYear() }; }
const fmtDay = (s: string) => { const p = dayParts(s); return `${p.d} ${p.m} ${p.y}`; };

export function describeFilter(spec: FilterSpec): string[] {
  const f = normalizeFilter(spec);
  const out: string[] = [];
  const validDays = f.period && [f.period.from, f.period.to].some(isDay);
  if (f.period && validDays) {
    const basis = { mulai: "kasus mulai", akhir: "kasus berakhir", event: "ada event" }[f.period.by];
    const from = isDay(f.period.from) ? f.period.from : undefined, to = isDay(f.period.to) ? f.period.to : undefined; // invalid bounds are skipped
    let range: string;
    if (from && to) {
      const a = dayParts(from), b = dayParts(to);
      range = a.y === b.y ? `${a.d} ${a.m}–${b.d} ${b.m} ${b.y}` : `${fmtDay(from)}–${fmtDay(to)}`;
    } else range = from ? `sejak ${fmtDay(from)}` : `sampai ${fmtDay(to!)}`;
    out.push(`Periode: ${basis} ${range}`);
  }
  if (f.vendors) out.push(`Vendor: ${f.vendors.join(", ")}`);
  if (f.hasActivities) out.push(`Harus memuat aktivitas: ${f.hasActivities.join(", ")}`);
  if (f.lacksActivities) out.push(`Tidak boleh memuat aktivitas: ${f.lacksActivities.join(", ")}`);
  if (f.variantIds) out.push(`Varian: ${f.variantIds.length} dipilih`);
  if (f.duration) {
    const { minDays: a, maxDays: b } = f.duration;
    out.push(`Durasi: ${a !== undefined && b !== undefined ? `${a}–${b}` : a !== undefined ? `minimal ${a}` : `maksimal ${b}`} hari`);
  }
  if (f.completion) out.push(`Status: ${f.completion}`);
  if (f.po) out.push(`Nomor PO: ${f.po}`);
  return out;
}

// ---- objects & lookups ----
export function objectGroups(log: EventLog): ObjectGroup[] {
  const groups = new Map<string, LogCase[]>();
  for (const c of log.cases) {
    const g = groups.get(c.objects.po);
    if (g) g.push(c); else groups.set(c.objects.po, [c]);
  }
  return [...groups]
    .map(([id, cases]) => ({
      id, caseIds: cases.map((c) => c.id), caseCount: cases.length,
      fromMs: Math.min(...cases.map((c) => c.startMs)), toMs: Math.max(...cases.map((c) => c.endMs)),
      variantIds: [...new Set(cases.map((c) => variantIdOf(c.events.map((e) => e.activity))))].sort(byText),
    }))
    .sort((a, b) => b.caseCount - a.caseCount || byText(a.id, b.id));
}

/** Cases behind a map node, map edge or variant of the (already filtered) log; unknown ids give []. null = every case. */
export function casesForSelection(filtered: EventLog, dfg: Dfg, sel: { kind: "node" | "edge" | "variant"; id: string } | null): LogCase[] {
  if (!sel) return filtered.cases;
  if (sel.kind === "node") return dfg.nodes.some((n) => n.id === sel.id) ? casesForNode(filtered, sel.id) : [];
  if (sel.kind === "edge") {
    const e = dfg.edges.find((x) => x.id === sel.id);
    return e ? casesForEdge(filtered, e.from, e.to) : [];
  }
  return filtered.cases.filter((c) => variantIdOf(c.events.map((e) => e.activity)) === sel.id);
}

export const groupCases = (log: EventLog, po: string): LogCase[] => log.cases.filter((c) => c.objects.po === po);
/** Every event of the given cases in one list, by event time; ties by caseId then index (deterministic, inputs untouched). */
export function mergedTimeline(cases: LogCase[]): { caseId: string; event: LogEvent; index: number }[] {
  return cases
    .flatMap((c) => c.events.map((event, index) => ({ caseId: c.id, event, index })))
    .sort((a, b) => Date.parse(a.event.time) - Date.parse(b.event.time) || byText(a.caseId, b.caseId) || a.index - b.index);
}

export const caseById = (log: EventLog, id: string): LogCase | undefined => log.cases.find((c) => c.id === id);

/** Gap to the previous event per event (first = null); clamped at 0 so out-of-order rows never show a negative gap. */
export const eventGaps = (kase: LogCase): (number | null)[] =>
  kase.events.map((e, i) => (i === 0 ? null : Math.max(0, Date.parse(e.time) - Date.parse(kase.events[i - 1].time))));

export function provenance(snapshot: Snapshot, mapping: MappingVersion, event: LogEvent): { fileName: string; rowRef: number; mappingVersion: number } {
  return { fileName: snapshot.fileName, rowRef: event.rowRef, mappingVersion: mapping.version };
}

// ---- project entry ----
const memo = new Map<string, FilteredResult>();

export function filteredLogFor(state: MockState, projectId: string, spec: FilterSpec): FilteredResult | null {
  const base = eventLogFor(state, projectId);
  if (!base) return null;
  const normalized = normalizeFilter(spec);
  const key = `${base.snapshot.id}:${base.mapping.id}:${JSON.stringify(normalized)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const filtered = applyFilter(base.log, normalized);
  const result: FilteredResult = {
    full: base.log, filtered, dfg: filtered === base.log ? base.dfg : buildDfg(filtered), variants: buildVariants(filtered),
    sourceLabel: base.sourceLabel, mappingVersion: base.mappingVersion, hasStartTime: base.hasStartTime, attrsAvailable: base.attrsAvailable,
    snapshot: base.snapshot, mapping: base.mapping,
  };
  memo.set(key, result);
  return result;
}
