import { buildEventLog, percentile, type EventLog, type LogCase } from "./eventlog";
import { runSnapshot } from "./metrics";
import type { MockState, MonitoringConfig, MonitoringRun } from "./types";

export interface TransitionStat {
  id: string; from: string; to: string; count: number; caseCount: number;
  medianMs: number; p90Ms: number; totalMs: number; sharePct: number; indicated: boolean;
}
export interface ReworkActivity {
  activity: string; pct: number; avgRepeats: number;
  medianWithMs: number | null; medianWithoutMs: number | null; diffMs: number | null; caseIds: string[];
}

const DAY = 86_400_000;
const median = (xs: number[]): number | null => (xs.length === 0 ? null : percentile([...xs].sort((a, b) => a - b), 0.5));

// ---- run log ----
const memo = new Map<string, EventLog | null>();

// Memo key includes the inputs, not just run.id, so edited copies of a run never see a stale log.
export function runLog(state: MockState, run: MonitoringRun): EventLog | null {
  const key = [run.id, run.snapshotId, run.mappingId, run.periodFrom, run.periodTo].join("|");
  if (memo.has(key)) return memo.get(key)!;
  const snapshot = runSnapshot(state, run);
  const mapping = state.mappings.find((m) => m.id === run.mappingId);
  const full = snapshot && mapping ? buildEventLog(snapshot, mapping) : null;
  const from = Date.parse(`${run.periodFrom}T00:00:00Z`);
  const to = Date.parse(`${run.periodTo}T23:59:59.999Z`);
  const log = full && { ...full, cases: full.cases.filter((c) => c.startMs >= from && c.startMs <= to) };
  memo.set(key, log);
  return log;
}

// ---- bottleneck ----
function pairs(c: LogCase) {
  return c.events.slice(1).map((e, i) => ({ from: c.events[i].activity, to: e.activity, gap: Date.parse(e.time) - Date.parse(c.events[i].time) }));
}

export function bottlenecks(log: EventLog, config: MonitoringConfig): { transitions: TransitionStat[]; totalCaseMs: number; cases: number } {
  const acc = new Map<string, { from: string; to: string; gaps: number[]; cases: Set<string> }>();
  for (const c of log.cases) {
    for (const p of pairs(c)) {
      const id = `${p.from}→${p.to}`;
      const e = acc.get(id) ?? { from: p.from, to: p.to, gaps: [], cases: new Set() };
      e.gaps.push(p.gap); e.cases.add(c.id);
      acc.set(id, e);
    }
  }
  const totalCaseMs = log.cases.reduce((n, c) => n + c.durationMs, 0);
  const threshold = config.bottleneckP90Days * DAY;
  const transitions = [...acc]
    .map(([id, e]) => {
      const sorted = [...e.gaps].sort((a, b) => a - b);
      const totalMs = e.gaps.reduce((n, g) => n + g, 0);
      return { id, from: e.from, to: e.to, count: e.gaps.length, caseCount: e.cases.size, medianMs: percentile(sorted, 0.5), p90Ms: percentile(sorted, 0.9),
        totalMs, sharePct: totalCaseMs === 0 ? 0 : (totalMs / totalCaseMs) * 100, indicated: false };
    })
    .sort((a, b) => b.totalMs - a.totalMs || (a.id < b.id ? -1 : 1));
  transitions.forEach((t, rank) => { t.indicated = rank < config.bottleneckTopN && t.p90Ms > threshold; });
  return { transitions, totalCaseMs, cases: log.cases.length };
}

export function transitionCases(log: EventLog, from: string, to: string): { caseId: string; gapMs: number }[] {
  const out: { caseId: string; gapMs: number }[] = [];
  for (const c of log.cases) {
    const gaps = pairs(c).filter((p) => p.from === from && p.to === to).map((p) => p.gap);
    if (gaps.length > 0) out.push({ caseId: c.id, gapMs: Math.max(...gaps) });
  }
  return out.sort((a, b) => b.gapMs - a.gapMs);
}

// ---- rework ----
const occurrences = (c: LogCase, activity: string) => c.events.filter((e) => e.activity === activity).length;

export function reworkStats(log: EventLog, config: MonitoringConfig): { cases: number; anyPct: number; caseIds: string[]; activities: ReworkActivity[] } | null {
  const defn = config.reworkActivities;
  if (defn === null) return null;
  const total = log.cases.length;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const activities = defn.map((activity): ReworkActivity => {
    const withR = log.cases.filter((c) => occurrences(c, activity) > 1);
    const withoutR = log.cases.filter((c) => occurrences(c, activity) <= 1);
    const wm = median(withR.map((c) => c.durationMs));
    const om = median(withoutR.map((c) => c.durationMs));
    return {
      activity, pct: pct(withR.length), caseIds: withR.map((c) => c.id),
      avgRepeats: withR.length === 0 ? 0 : withR.reduce((n, c) => n + occurrences(c, activity) - 1, 0) / withR.length,
      medianWithMs: wm, medianWithoutMs: om, diffMs: wm !== null && om !== null ? wm - om : null,
    };
  }).sort((a, b) => b.pct - a.pct);
  const any = log.cases.filter((c) => defn.some((a) => occurrences(c, a) > 1));
  return { cases: total, anyPct: pct(any.length), caseIds: any.map((c) => c.id), activities };
}
