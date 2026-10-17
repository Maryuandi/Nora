import { activityLabels, hash, suggestRoles } from "./mapping";
import { previewDataset } from "./rules";
import type { MappingVersion, MockState, Snapshot } from "./types";

export interface LogEvent { activity: string; activityRaw: string; time: string; resource: string }
export interface LogCase { id: string; events: LogEvent[]; startMs: number; endMs: number; durationMs: number }
export interface EventLog { cases: LogCase[]; activities: string[]; source: { sourceId: string; snapshotId: string; mappingVersion: number } }
export interface DfgNode { id: string; label: string; caseCount: number; eventCount: number }
export interface DfgEdge { id: string; from: string; to: string; count: number; caseCount: number; medianMs: number; p90Ms: number }
export interface Dfg { nodes: DfgNode[]; edges: DfgEdge[]; totalCases: number }

// shortcut: activity labels literally named "__start"/"__end" or containing "→" would collide with node/edge ids; unsupported in the mock.
export const START_ID = "__start";
export const END_ID = "__end";

const MAX_ACTIVITIES = 8;
const MAX_CASES = 400;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FALLBACK_FROM = Date.UTC(2026, 0, 1);
const FALLBACK_TO = Date.UTC(2026, 11, 31);

const normKey = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,;]+$/, "");

// ---- activities ----
function stagesOf(snapshot: Snapshot, mapping: MappingVersion): { stages: string[]; extras: string[] } {
  const rules = new Map(mapping.labels.map((l) => [l.raw, l.canonical]));
  const resolve = (raw: string): string | null => {
    const c = rules.has(raw) ? rules.get(raw)! : raw;
    const t = c === null ? "" : c.trim();
    return t === "" ? null : t;
  };
  const actCol = snapshot.columns ? Object.entries(suggestRoles(snapshot.columns)).find(([, r]) => r === "activity")?.[0] : undefined;
  const idx = actCol === undefined ? -1 : snapshot.columns!.findIndex((c) => c.name === actCol);
  const previewRaw = idx < 0 ? [] : (snapshot.preview ?? []).map((r) => r[idx]).filter((v): v is string => !!v);

  const counts = new Map<string, number>(); // raw -> frequency; labels from M03a first, preview-only values count by occurrence
  for (const { raw, count } of activityLabels(snapshot)) counts.set(raw, count);
  for (const raw of previewRaw) if (!counts.has(raw)) counts.set(raw, previewRaw.filter((v) => v === raw).length);

  const spellings = new Map<string, Map<string, number>>(); // key -> display name -> total count
  const excluded = new Set([...counts.keys()].filter((raw) => rules.get(raw) === null).map(normKey)); // an excluded label drops its whole spelling family
  for (const [raw, count] of counts) {
    const name = resolve(raw);
    if (name === null || excluded.has(normKey(name)) || excluded.has(normKey(raw))) continue;
    const k = normKey(name);
    const m = spellings.get(k) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + count);
    spellings.set(k, m);
  }
  const display = (k: string) => [...spellings.get(k)!].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  const total = (k: string) => [...spellings.get(k)!.values()].reduce((n, c) => n + c, 0);

  const stageKeys: string[] = [];
  for (const raw of previewRaw) {
    const name = resolve(raw);
    const k = name === null ? null : normKey(name);
    if (k !== null && spellings.has(k) && !stageKeys.includes(k)) stageKeys.push(k);
  }
  const extraKeys = [...spellings.keys()].filter((k) => !stageKeys.includes(k)).sort((a, b) => total(b) - total(a) || (a < b ? -1 : 1));
  const stages = stageKeys.map(display).slice(0, MAX_ACTIVITIES);
  return { stages, extras: extraKeys.map(display).slice(0, MAX_ACTIVITIES - stages.length) };
}

export function processActivities(snapshot: Snapshot, mapping: MappingVersion): string[] {
  const { stages, extras } = stagesOf(snapshot, mapping);
  return [...stages, ...extras];
}

// ---- event log ----
function parseMs(text: string | undefined, fallback: number): number {
  const t = text === undefined ? NaN : Date.parse(text);
  return Number.isFinite(t) ? t : fallback;
}

function pathFor(stages: string[], pattern: number, pick: number): string[] {
  const k = stages.length;
  const middle = k - 2; // stages 1..k-2
  if (pattern >= 90 && k >= 3) return [...stages.slice(0, 3), ...stages.slice(1)]; // back to the 2nd activity, then continue
  if (pattern >= 80 && k >= 3) { const skip = 1 + (pick % middle); return stages.filter((_, i) => i !== skip); }
  if (pattern >= 70 && middle >= 2) { const j = 1 + (pick % (middle - 1)); const p = [...stages]; [p[j], p[j + 1]] = [p[j + 1], p[j]]; return p; }
  if (pattern >= 55 && pattern < 70 && middle >= 1) { const j = 1 + (pick % middle); return [...stages.slice(0, j + 1), stages[j], ...stages.slice(j + 1)]; }
  return [...stages]; // always a copy: callers push onto the result
}

export function buildEventLog(snapshot: Snapshot, mapping: MappingVersion): EventLog | null {
  const rows = snapshot.stats?.rows;
  const { stages, extras } = stagesOf(snapshot, mapping);
  if (typeof rows !== "number" || !Number.isFinite(rows) || stages.length + extras.length < 2 || stages.length < 2) return null;
  const n = Math.min(Math.round(Math.max(0, rows) / 6), MAX_CASES);
  const from = parseMs(snapshot.stats?.timeFrom, FALLBACK_FROM);
  const to = Math.max(from, parseMs(snapshot.stats?.timeTo, FALLBACK_TO));

  const cases: LogCase[] = Array.from({ length: n }, (_, i) => {
    const h = hash(`${snapshot.checksum}:${i}`);
    const path = pathFor(stages, h % 100, hash(`${snapshot.checksum}:${i}:pick`));
    // Rare noise label (about 1 in 40 cases) appended after the last stage; never part of the main stage order.
    if (extras.length > 0 && hash(`${snapshot.checksum}:${i}:x`) % 40 === 0) path.push(extras[0]);
    let t = from + Math.floor((i * (to - from)) / n);
    const events: LogEvent[] = path.map((activity, j) => {
      if (j > 0) {
        const gap = HOUR + (hash(`${snapshot.checksum}:${i}:${j}`) % (6 * DAY - HOUR + 1));
        t += path[j - 1] === stages[1] && activity === stages[2] ? gap * 3 : gap; // intentional bottleneck: 2nd -> 3rd activity
      }
      return { activity, activityRaw: activity, time: new Date(t).toISOString(), resource: `user_0${1 + (hash(`${snapshot.checksum}:${i}:r${j}`) % 4)}` };
    });
    const startMs = Date.parse(events[0].time);
    const endMs = Date.parse(events[events.length - 1].time);
    return { id: `C-${String(i + 1).padStart(4, "0")}`, events, startMs, endMs, durationMs: endMs - startMs };
  });
  return {
    cases,
    activities: [...stages, ...extras],
    source: { sourceId: snapshot.sourceId, snapshotId: snapshot.id, mappingVersion: mapping.version },
  };
}

// ---- DFG ----
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function buildDfg(log: EventLog): Dfg {
  const nodes = new Map<string, { eventCount: number; cases: Set<number> }>();
  const edges = new Map<string, { from: string; to: string; count: number; cases: Set<number>; gaps: number[] }>();
  const node = (id: string) => { let v = nodes.get(id); if (!v) nodes.set(id, (v = { eventCount: 0, cases: new Set() })); return v; };
  const edge = (from: string, to: string, ci: number, gap: number) => {
    const id = `${from}→${to}`;
    let e = edges.get(id);
    if (!e) edges.set(id, (e = { from, to, count: 0, cases: new Set(), gaps: [] }));
    e.count++; e.cases.add(ci); e.gaps.push(gap);
  };
  log.cases.forEach((c, ci) => {
    let prev = START_ID;
    let prevMs = c.startMs;
    for (const ev of c.events) {
      const ms = Date.parse(ev.time);
      const v = node(ev.activity);
      v.eventCount++; v.cases.add(ci);
      edge(prev, ev.activity, ci, prev === START_ID ? 0 : ms - prevMs);
      prev = ev.activity; prevMs = ms;
    }
    edge(prev, END_ID, ci, 0);
  });

  const order = (id: string) => { const i = log.activities.indexOf(id); return i < 0 ? log.activities.length : i; };
  const activityNodes: DfgNode[] = [...nodes]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([id, v]) => ({ id, label: id, caseCount: v.cases.size, eventCount: v.eventCount }));
  const total = log.cases.length;
  return {
    totalCases: total,
    nodes: [{ id: START_ID, label: "Mulai", caseCount: total, eventCount: total }, ...activityNodes, { id: END_ID, label: "Selesai", caseCount: total, eventCount: total }],
    edges: [...edges].map(([id, e]) => {
      const sorted = [...e.gaps].sort((a, b) => a - b);
      return { id, from: e.from, to: e.to, count: e.count, caseCount: e.cases.size, medianMs: percentile(sorted, 0.5), p90Ms: percentile(sorted, 0.9) };
    }),
  };
}

// ---- simplification ----
const keepCount = (pct: number, total: number) => (total === 0 ? 0 : Math.max(1, Math.ceil((Math.min(100, Math.max(1, pct)) * total) / 100)));
const isTerminal = (id: string) => id === START_ID || id === END_ID;

export function simplify(dfg: Dfg, opts: { activityPct: number; transitionPct: number }): { nodes: DfgNode[]; edges: DfgEdge[]; hiddenActivities: number; hiddenTransitions: number } {
  const acts = dfg.nodes.filter((x) => !isTerminal(x.id));
  const visible = new Set(
    [...acts].sort((a, b) => b.eventCount - a.eventCount || (a.id < b.id ? -1 : 1)).slice(0, keepCount(opts.activityPct, acts.length)).map((x) => x.id),
  );
  const nodes = dfg.nodes.filter((x) => isTerminal(x.id) || visible.has(x.id));
  const top = new Set(
    [...dfg.edges].sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1)).slice(0, keepCount(opts.transitionPct, dfg.edges.length)).map((e) => e.id),
  );
  const shown = new Set(nodes.map((x) => x.id));
  const edges = dfg.edges.filter((e) => top.has(e.id) && shown.has(e.from) && shown.has(e.to));
  return { nodes, edges, hiddenActivities: acts.length - visible.size, hiddenTransitions: dfg.edges.length - edges.length };
}

export function defaultSimplify(dfg: Dfg): { activityPct: number; transitionPct: number } {
  const n = dfg.nodes.filter((x) => !isTerminal(x.id)).length;
  return { activityPct: n > 30 ? Math.min(100, Math.max(1, Math.ceil((30 / n) * 100))) : 100, transitionPct: 100 };
}

// ---- cases ----
export function casesForNode(log: EventLog, nodeId: string): LogCase[] {
  return isTerminal(nodeId) ? [...log.cases] : log.cases.filter((c) => c.events.some((e) => e.activity === nodeId));
}

export function casesForEdge(log: EventLog, from: string, to: string): LogCase[] {
  return log.cases.filter((c) => {
    const seq = [START_ID, ...c.events.map((e) => e.activity), END_ID];
    return seq.some((a, i) => i < seq.length - 1 && a === from && seq[i + 1] === to);
  });
}

export function sortCases(cases: LogCase[], by: "durasi" | "event" | "mulai", dir: "asc" | "desc"): LogCase[] {
  const key = (c: LogCase) => (by === "durasi" ? c.durationMs : by === "event" ? c.events.length : c.startMs);
  const sign = dir === "asc" ? 1 : -1;
  return [...cases].sort((a, b) => sign * (key(a) - key(b))); // Array.sort is stable, so ties keep input order
}

export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; pages: number; page: number } {
  const s = Math.max(1, Math.floor(size) || 1);
  const pages = Math.max(1, Math.ceil(items.length / s));
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { items: items.slice((p - 1) * s, p * s), pages, page: p };
}

// ---- project entry ----
type EventLogResult = { log: EventLog; dfg: Dfg; sourceLabel: string; mappingVersion: number; hasStartTime: boolean };
const memo = new Map<string, EventLogResult | null>();

export function eventLogFor(state: MockState, projectId: string): EventLogResult | null {
  const ds = previewDataset(state, projectId);
  if (!ds) return null;
  const key = `${ds.snapshot.id}|${ds.mapping.id}`;
  if (memo.has(key)) return memo.get(key)!;
  const log = buildEventLog(ds.snapshot, ds.mapping);
  const name = state.sources.find((x) => x.id === ds.sourceId)?.name ?? ds.sourceId;
  const result = log && {
    log, dfg: buildDfg(log), sourceLabel: `${name} · pemetaan v${ds.mapping.version}`, mappingVersion: ds.mapping.version,
    hasStartTime: Object.values(ds.mapping.roles).includes("timestamp_start"),
  };
  memo.set(key, result);
  return result;
}
