import { FIXTURE } from "./assessment-data";
import type { Assessment, AssessmentCorrection, AssessmentStatus, Candidate, Criterion, CriterionScore, Finding, MockState, Relevance } from "./types";

export const THRESHOLDS = { sufficient: 0.5, topProb: 0.6, margin: 0.15 } as const;
export const RELEVANCE_ORDER: Relevance[] = ["relevan", "sebagian_relevan", "tidak_relevan", "informasi_tidak_cukup"];
export const RELEVANCE_LABEL: Record<Relevance, string> = {
  relevan: "Relevan", sebagian_relevan: "Sebagian relevan", tidak_relevan: "Tidak relevan", informasi_tidak_cukup: "Informasi tidak cukup",
};
export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  otomatis: "Otomatis", perlu_review: "Perlu review", informasi_tidak_cukup: "Informasi tidak cukup", gagal: "Gagal", tertunda: "Tertunda",
};

const STATUS_ORDER: AssessmentStatus[] = ["gagal", "perlu_review", "informasi_tidak_cukup", "tertunda", "otomatis"];

export function totalScore(scores: CriterionScore[], criteria: Criterion[]): number | null {
  let num = 0;
  let den = 0;
  for (const sc of scores) {
    const c = criteria.find((x) => x.key === sc.key);
    if (!c) continue;
    num += ((sc.level - 1) / 4) * c.weight;
    den += c.weight;
  }
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

export function topTwo(probs: Record<Relevance, number>): { top: [Relevance, number]; second: [Relevance, number]; margin: number } {
  // Array.prototype.sort is stable, so ties keep RELEVANCE_ORDER.
  const [a, b] = RELEVANCE_ORDER.map((k): [Relevance, number] => [k, probs[k]]).sort((x, y) => y[1] - x[1]);
  return { top: a, second: b, margin: a[1] - b[1] };
}

export function deriveStatus(i: { sufficientProb: number; relevanceProbs: Record<Relevance, number>; failed?: boolean; pending?: boolean }): AssessmentStatus {
  if (i.failed) return "gagal";
  if (i.pending) return "tertunda";
  if (i.sufficientProb < THRESHOLDS.sufficient) return "informasi_tidak_cukup";
  const { top, margin } = topTwo(i.relevanceProbs);
  // epsilon: float subtraction (e.g. 0.75 - 0.6) must not push an exact-boundary margin below 0.15
  return top[1] < THRESHOLDS.topProb - 1e-9 || margin < THRESHOLDS.margin - 1e-9 ? "perlu_review" : "otomatis";
}

export function effective(a: Assessment, corrections: AssessmentCorrection[]): { relevance: Relevance; source: "model" | "analis"; correction?: AssessmentCorrection } {
  let latest: AssessmentCorrection | undefined;
  for (const c of corrections) if (c.assessmentId === a.id && (!latest || c.at >= latest.at)) latest = c;
  return latest ? { relevance: latest.relevance, source: "analis", correction: latest } : { relevance: topTwo(a.relevance.probs).top[0], source: "model" };
}

export const currentAssessments = (s: MockState, findingId: string): Assessment[] =>
  s.assessments.filter((a) => a.findingId === findingId && !a.supersededBy);

export function reviewQueue(s: MockState, projectId: string, f: { findingId?: string; status?: AssessmentStatus } = {}): Assessment[] {
  const corrected = new Set(s.corrections.map((c) => c.assessmentId));
  const margin = (a: Assessment) => topTwo(a.relevance.probs).margin;
  return s.assessments
    .filter((a) => a.projectId === projectId && !a.supersededBy && a.status !== "otomatis" && !corrected.has(a.id)
      && (!f.findingId || a.findingId === f.findingId) && (!f.status || a.status === f.status))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.status === "perlu_review" ? margin(a) - margin(b) : 0));
}

export function summarize(s: MockState, findingId: string): { byStatus: Record<AssessmentStatus, number>; corrected: number; unscored: number } {
  const cur = currentAssessments(s, findingId);
  const byStatus = { otomatis: 0, perlu_review: 0, informasi_tidak_cukup: 0, gagal: 0, tertunda: 0 } as Record<AssessmentStatus, number>;
  for (const a of cur) byStatus[a.status]++;
  const ids = new Set(cur.map((a) => a.id));
  const corrected = new Set(s.corrections.filter((c) => ids.has(c.assessmentId)).map((c) => c.assessmentId)).size;
  const finding = s.findings.find((x) => x.id === findingId);
  const scored = new Set(cur.map((a) => a.candidateId));
  const unscored = (finding?.candidateIds ?? []).filter((id) => s.candidates.find((c) => c.id === id)?.applicable && !scored.has(id)).length;
  return { byStatus, corrected, unscored };
}

// 0.7 on the chosen level; the rest is split evenly over adjacent levels (all of it to the single neighbour at an edge).
export function levelProbs(level: number): number[] {
  const p = [0, 0, 0, 0, 0];
  const i = level - 1;
  p[i] = 0.7;
  const nb = [i - 1, i + 1].filter((j) => j >= 0 && j < 5);
  for (const j of nb) p[j] = 0.3 / nb.length;
  return p;
}

export function runFixture(finding: Finding, candidates: Candidate[], ctx: { runId: string; at: string; only?: string[] }): Assessment[] {
  return candidates
    .filter((c) => finding.candidateIds.includes(c.id) && c.applicable && (!ctx.only || ctx.only.includes(c.id)))
    .map((c) => {
      const fx = FIXTURE[c.id];
      const failed = !fx || !!fx.failed;
      const sufficient = failed ? 0 : fx.sufficient;
      const relevanceProbs = failed ? { relevan: 0.25, sebagian_relevan: 0.25, tidak_relevan: 0.25, informasi_tidak_cukup: 0.25 } : fx.relevance;
      const scores = failed ? [] : fx.levels.map((level, i) => ({ key: c.criteria[i].key, level, probs: levelProbs(level) }));
      return {
        id: `${ctx.runId}-${c.id}`, projectId: finding.projectId, findingId: finding.id, candidateId: c.id,
        status: deriveStatus({ sufficientProb: sufficient, relevanceProbs, failed }),
        sufficient: { prob: sufficient }, scores, relevance: { probs: relevanceProbs },
        modelId: "jev-demo-fixture", specVersion: 1, evidenceBundleId: finding.evidenceBundleId, runId: ctx.runId, createdAt: ctx.at,
        rawOutputRef: `raw://${ctx.runId}/${c.id}`,
      };
    });
}
