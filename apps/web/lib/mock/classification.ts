import { CLASS_FIXTURE } from "./classification-data";
import type { ClassCorrection, ClassItem, ClassResult, ClassStatus, MockState, QuestionSpec, Thresholds } from "./types";

type Task = "aktivitas" | "catatan";

export const CLASS_STATUS_LABEL: Record<ClassStatus, string> = { otomatis: "Otomatis", perlu_review: "Perlu review", gagal: "Gagal" };

export function topTwoOf(probs: Record<string, number>, order: string[]): { top: [string, number]; second: [string, number]; margin: number } {
  // Array.prototype.sort is stable, so ties keep `order`.
  const [a, b = ["", 0] as [string, number]] = order.map((k): [string, number] => [k, probs[k] ?? 0]).sort((x, y) => y[1] - x[1]);
  return { top: a ?? ["", 0], second: b, margin: (a?.[1] ?? 0) - b[1] };
}

export function classStatus(probs: Record<string, number>, th: Thresholds, failed?: boolean): ClassStatus {
  if (failed) return "gagal";
  const { top, margin } = topTwoOf(probs, Object.keys(probs));
  // epsilon: float subtraction (e.g. 0.75 - 0.6) must not push an exact-boundary margin below 0.15
  return top[1] < th.topProb - 1e-9 || margin < th.margin - 1e-9 ? "perlu_review" : "otomatis";
}

export const currentClassResults = (s: MockState, projectId: string, task: Task): ClassResult[] =>
  s.classResults.filter((r) => r.projectId === projectId && r.task === task && !r.supersededBy);

export function effectiveClass(r: ClassResult, corrections: ClassCorrection[], order: string[]): { category: string; source: "model" | "analis"; correction?: ClassCorrection } {
  let latest: ClassCorrection | undefined;
  for (const c of corrections) if (c.resultId === r.id && (!latest || c.at >= latest.at)) latest = c;
  return latest ? { category: latest.category, source: "analis", correction: latest } : { category: topTwoOf(r.probs, order).top[0], source: "model" };
}

export function classQueue(s: MockState, projectId: string, task: Task): ClassResult[] {
  const corrected = new Set(s.classCorrections.map((c) => c.resultId));
  const margin = (r: ClassResult) => topTwoOf(r.probs, Object.keys(r.probs)).margin;
  return currentClassResults(s, projectId, task)
    .filter((r) => r.status !== "otomatis" && !corrected.has(r.id))
    .sort((a, b) => (a.status === b.status ? (a.status === "perlu_review" ? margin(a) - margin(b) : 0) : a.status === "gagal" ? -1 : 1));
}

// A failed result carries placeholder probabilities, so it has no category unless an analyst corrected it.
const counted = (r: ClassResult, corrections: ClassCorrection[]) => r.status !== "gagal" || corrections.some((c) => c.resultId === r.id);

export function classSummary(s: MockState, projectId: string, task: Task, order: string[]): { byCategory: Record<string, number>; byStatus: Record<ClassStatus, number>; unscored: number } {
  const cur = currentClassResults(s, projectId, task);
  const byCategory: Record<string, number> = Object.fromEntries(order.map((k) => [k, 0]));
  const byStatus: Record<ClassStatus, number> = { otomatis: 0, perlu_review: 0, gagal: 0 };
  for (const r of cur) {
    byStatus[r.status]++;
    if (!counted(r, s.classCorrections)) continue;
    const k = effectiveClass(r, s.classCorrections, order).category;
    byCategory[k] = (byCategory[k] ?? 0) + 1;
  }
  const scored = new Set(cur.map((r) => r.itemId));
  const unscored = s.classItems.filter((i) => i.projectId === projectId && i.task === task && !scored.has(i.id)).length;
  return { byCategory, byStatus, unscored };
}

type Group = { counts: Record<string, number>; total: number };

export function noteAggregation(s: MockState, projectId: string): { rows: ({ activity: string } & Group)[]; periods: ({ period: string } & Group)[] } {
  const cur = currentClassResults(s, projectId, "catatan").filter((r) => counted(r, s.classCorrections));
  const spec = s.specs.filter((x) => x.projectId === projectId && x.task === "catatan").sort((a, b) => b.version - a.version)[0];
  const order = spec ? spec.categories.map((c) => c.key) : [...new Set(cur.flatMap((r) => Object.keys(r.probs)))].sort();
  const fresh = (): Group => ({ counts: Object.fromEntries(order.map((k) => [k, 0])), total: 0 });
  const rows = new Map<string, Group>();
  const periods = new Map<string, Group>();
  for (const r of cur) {
    const item = s.classItems.find((i) => i.id === r.itemId);
    const k = effectiveClass(r, s.classCorrections, order).category;
    for (const [m, key] of [[rows, item?.activity ?? "–"], [periods, item?.period ?? "–"]] as const) {
      const g = m.get(key) ?? fresh();
      g.counts[k] = (g.counts[k] ?? 0) + 1;
      g.total++;
      m.set(key, g);
    }
  }
  return {
    rows: [...rows].map(([activity, g]) => ({ activity, ...g })),
    periods: [...periods].map(([period, g]) => ({ period, ...g })).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

function fixtureProbs(keys: string[], fx: (typeof CLASS_FIXTURE)[string] | undefined): Record<string, number> | null {
  if (!fx) return null;
  const all: [string, number][] = fx.second ? [[fx.top, fx.p], [fx.second, fx.p2 ?? 0]] : [[fx.top, fx.p]];
  const kept = all.filter(([k]) => keys.includes(k));
  const used = kept.reduce((a, [, p]) => a + p, 0);
  const others = keys.filter((k) => !kept.some(([x]) => x === k));
  const probs: Record<string, number> = {};
  for (const k of keys) probs[k] = others.includes(k) ? (1 - used) / others.length : kept.find(([x]) => x === k)![1];
  // shortcut: no category left to absorb the remainder, so rescale; irrelevant for seed specs.
  if (!others.length) for (const k of keys) probs[k] /= used;
  return probs;
}

export function runClassFixture(items: ClassItem[], spec: QuestionSpec, ctx: { runId: string; at: string }): ClassResult[] {
  const keys = spec.categories.map((c) => c.key);
  return items.map((item) => {
    const fixed = fixtureProbs(keys, CLASS_FIXTURE[item.id]);
    const probs = fixed ?? Object.fromEntries(keys.map((k) => [k, 1 / keys.length]));
    return {
      id: `${ctx.runId}-${item.id}`, projectId: item.projectId, itemId: item.id, task: item.task, specVersion: spec.version,
      modelId: "jev-demo-fixture", runId: ctx.runId, at: ctx.at, probs, status: classStatus(probs, spec.thresholds, !fixed),
    };
  });
}
