import { currentAssessments, hasModelVerdict, topTwo } from "./assessment";
import { currentClassResults, topTwoOf } from "./classification";
import { activeSpec } from "./specs";
import type { Bin, EvaluationRun, GoldItem, MockState, TaskKind } from "./types";

export const BIN_EDGES = [0, 0.4, 0.6, 0.8, 0.9, 1.0];
export const TARGETS = { aktivitas: { accuracy: 0.85 }, relevansi: { accuracy: 0.7 }, catatan: { accuracy: 0.85 }, highConfAccuracy: 0.8, reviewShareMax: 0.3 };

export type EvalPair = { pred: string; conf: number; label: string; auto: boolean };
type Metrics = Pick<EvaluationRun, "n" | "highConf" | "bins"> & Record<"accuracy" | "macroF1" | "autoCoverage" | "autoAccuracy", number | null>;

const ratio = (num: number, den: number): number | null => (den ? num / den : null);

export function computeMetrics(pairs: EvalPair[]): Metrics {
  const n = pairs.length;
  const hit = (p: EvalPair) => p.pred === p.label;
  const auto = pairs.filter((p) => p.auto);
  const high = pairs.filter((p) => p.conf >= 0.8);
  const bins: Bin[] = BIN_EDGES.slice(0, -1).map((lo, i) => {
    const hi = BIN_EDGES[i + 1];
    const inBin = pairs.filter((p) => p.conf >= lo && (p.conf < hi || (i === BIN_EDGES.length - 2 && p.conf <= hi)));
    return { lo, hi, n: inBin.length, meanConf: inBin.length ? inBin.reduce((a, p) => a + p.conf, 0) / inBin.length : 0, accuracy: ratio(inBin.filter(hit).length, inBin.length) };
  });
  const labels = [...new Set(pairs.flatMap((p) => [p.pred, p.label]))];
  const f1 = labels.map((l) => {
    const tp = pairs.filter((p) => p.pred === l && p.label === l).length;
    const precision = ratio(tp, pairs.filter((p) => p.pred === l).length) ?? 0;
    const recall = ratio(tp, pairs.filter((p) => p.label === l).length) ?? 0;
    return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  });
  return {
    n, accuracy: ratio(pairs.filter(hit).length, n), macroF1: n ? f1.reduce((a, b) => a + b, 0) / labels.length : null,
    autoCoverage: ratio(auto.length, n), autoAccuracy: ratio(auto.filter(hit).length, auto.length),
    highConf: { n: high.length, accuracy: ratio(high.filter(hit).length, high.length) }, bins,
  };
}

export function cohenKappa(pairs: { a: string; b: string }[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const po = pairs.filter((p) => p.a === p.b).length / n;
  const count = (k: "a" | "b", l: string) => pairs.filter((p) => p[k] === l).length / n;
  const pe = [...new Set(pairs.flatMap((p) => [p.a, p.b]))].reduce((acc, l) => acc + count("a", l) * count("b", l), 0);
  return pe >= 1 - 1e-12 ? null : (po - pe) / (1 - pe);
}

type Hit = { id: string; pred: string; conf: number; auto: boolean };

function lookup(s: MockState, projectId: string, task: TaskKind): (itemRef: string) => Hit | undefined {
  if (task === "relevansi") {
    return (ref) => {
      const [findingId, candidateId] = ref.split(":");
      const a = currentAssessments(s, findingId).find((x) => x.projectId === projectId && x.candidateId === candidateId && hasModelVerdict(x));
      if (!a) return undefined;
      const [pred, conf] = topTwo(a.relevance.probs).top;
      return { id: a.id, pred, conf, auto: a.status === "otomatis" };
    };
  }
  const order = activeSpec(s, projectId, task)?.categories.map((c) => c.key) ?? [];
  const results = currentClassResults(s, projectId, task);
  return (ref) => {
    const r = results.find((x) => x.itemId === ref && x.status !== "gagal");
    if (!r) return undefined;
    const [pred, conf] = topTwoOf(r.probs, order).top;
    return { id: r.id, pred, conf, auto: r.status === "otomatis" };
  };
}

const goldOf = (s: MockState, projectId: string, task: TaskKind): GoldItem[] => s.goldItems.filter((g) => g.projectId === projectId && g.task === task);

export function evalPairs(s: MockState, projectId: string, task: TaskKind): { pairs: EvalPair[]; excluded: number; items: { gold: GoldItem; result?: { id: string; pred: string; conf: number; auto: boolean } }[] } {
  const find = lookup(s, projectId, task);
  const items = goldOf(s, projectId, task).map((gold) => ({ gold, result: find(gold.itemRef) }));
  const pairs = items.flatMap(({ gold, result }) => (result ? [{ pred: result.pred, conf: result.conf, label: gold.label, auto: result.auto }] : []));
  return { pairs, excluded: items.length - pairs.length, items };
}

export const agreementPairs = (s: MockState, projectId: string, task: TaskKind): { a: string; b: string }[] =>
  goldOf(s, projectId, task).flatMap((g) => (g.labelB ? [{ a: g.label, b: g.labelB }] : []));

export function reviewShareOf(s: MockState, projectId: string, task: TaskKind): number | null {
  const statuses = task === "relevansi"
    ? s.findings.filter((f) => f.projectId === projectId).flatMap((f) => currentAssessments(s, f.id)).map((a) => a.status)
    : currentClassResults(s, projectId, task).map((r) => r.status);
  return ratio(statuses.filter((x) => x !== "otomatis").length, statuses.length);
}

export function buildEvaluation(s: MockState, projectId: string, task: TaskKind, ctx: { id: string; at: string; actorId: string }): EvaluationRun | null {
  const spec = activeSpec(s, projectId, task);
  if (!spec) return null;
  const { pairs, excluded } = evalPairs(s, projectId, task);
  const m = computeMetrics(pairs);
  const modelId = task === "relevansi"
    ? s.assessments.find((a) => a.projectId === projectId && !a.supersededBy)?.modelId
    : currentClassResults(s, projectId, task)[0]?.modelId;
  return {
    id: ctx.id, projectId, task, at: ctx.at, actorId: ctx.actorId, modelId: modelId ?? "jev-demo-fixture", specVersion: spec.version, n: m.n, excluded,
    accuracy: m.accuracy ?? 0, macroF1: m.macroF1 ?? 0, autoCoverage: m.autoCoverage ?? 0, autoAccuracy: m.autoAccuracy,
    reviewShare: reviewShareOf(s, projectId, task) ?? 0, highConf: m.highConf, kappa: cohenKappa(agreementPairs(s, projectId, task)), bins: m.bins,
  };
}

/** Mirrors upsertGold: only an analyst other than the first labeler writes the second label. */
export const canEditSecondLabel = (g: GoldItem, viewerId: string): boolean => g.labeler !== viewerId;
