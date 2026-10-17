import type { EventLog } from "./eventlog";
import type { BpmnModel } from "./types";

export interface ReplayResult {
  produced: number; consumed: number; missing: number; remaining: number; fitness: number;
  unknown: string[]; perActivity: Record<string, { missing: number; remaining: number }>; // only activities with missing or remaining > 0
}

const fit = (missing: number, consumed: number, remaining: number, produced: number) =>
  0.5 * (1 - (consumed === 0 ? 0 : missing / consumed)) + 0.5 * (1 - (produced === 0 ? 0 : remaining / produced));

// Token replay on a sequential Petri net: places p0..pk, transition t_i moves p_i -> p_(i+1).
export function replayTrace(trace: string[], model: BpmnModel): ReplayResult {
  const acts = model.activities;
  const k = acts.length;
  const tokens = new Array<number>(k + 1).fill(0);
  tokens[0] = 1;
  let produced = 1, consumed = 0, missing = 0;
  const per: Record<string, { missing: number; remaining: number }> = {};
  const slot = (a: string) => (per[a] ??= { missing: 0, remaining: 0 });
  const unknown: string[] = [];
  for (const a of trace) {
    const i = acts.indexOf(a);
    if (i < 0) { unknown.push(a); continue; }
    consumed++;
    if (tokens[i] > 0) tokens[i]--; else { missing++; slot(a).missing++; }
    tokens[i + 1]++; produced++;
  }
  consumed++; // final token consumption from p_k
  if (tokens[k] > 0) tokens[k]--; else missing++;
  const remaining = tokens.reduce((n, t) => n + t, 0);
  tokens.forEach((t, i) => { if (t > 0 && i < k) slot(acts[i]).remaining += t; });
  return { produced, consumed, missing, remaining, fitness: fit(missing, consumed, remaining, produced), unknown, perActivity: per };
}

export interface Conformance {
  fitness: number; fitCases: number; cases: number;
  variants: { trace: string[]; cases: number; fitness: number; caseIds: string[] }[];
  activities: { activity: string; missing: number; remaining: number; cases: number }[];
  unknownActivities: { activity: string; cases: number }[];
}

export function conformance(log: EventLog, model: BpmnModel): Conformance {
  const groups = new Map<string, { trace: string[]; caseIds: string[] }>();
  for (const c of log.cases) {
    const trace = c.events.map((e) => e.activity);
    const key = JSON.stringify(trace);
    const g = groups.get(key) ?? { trace, caseIds: [] };
    g.caseIds.push(c.id);
    groups.set(key, g);
  }
  let missing = 0, consumed = 0, remaining = 0, produced = 0, fitCases = 0;
  const acts = new Map<string, { missing: number; remaining: number; cases: number }>();
  const unk = new Map<string, number>();
  const variants = [...groups.values()].map((g) => {
    const r = replayTrace(g.trace, model);
    const n = g.caseIds.length;
    missing += r.missing * n; consumed += r.consumed * n; remaining += r.remaining * n; produced += r.produced * n;
    if (r.fitness === 1 && r.unknown.length === 0) fitCases += n;
    for (const [a, v] of Object.entries(r.perActivity)) {
      const e = acts.get(a) ?? { missing: 0, remaining: 0, cases: 0 };
      e.missing += v.missing * n; e.remaining += v.remaining * n; e.cases += n;
      acts.set(a, e);
    }
    for (const a of new Set(r.unknown)) unk.set(a, (unk.get(a) ?? 0) + n);
    return { trace: g.trace, cases: n, fitness: r.fitness, caseIds: g.caseIds };
  }).sort((a, b) => b.cases - a.cases);
  return {
    fitness: log.cases.length === 0 ? 1 : fit(missing, consumed, remaining, produced),
    fitCases, cases: log.cases.length, variants,
    activities: [...acts].map(([activity, v]) => ({ activity, ...v })).filter((a) => a.missing + a.remaining > 0)
      .sort((a, b) => b.missing + b.remaining - (a.missing + a.remaining) || (a.activity < b.activity ? -1 : 1)),
    unknownActivities: [...unk].map(([activity, cases]) => ({ activity, cases })).sort((a, b) => b.cases - a.cases || (a.activity < b.activity ? -1 : 1)),
  };
}
