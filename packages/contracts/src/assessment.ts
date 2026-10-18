import { z } from "zod";

export const ASSESSMENT_STATUSES = ["queued", "running", "automatic", "needs_review", "insufficient_information", "failed", "confirmed", "corrected"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const RELEVANCE_OPTIONS = ["relevant", "partly_relevant", "not_relevant", "insufficient_information"] as const;
export type RelevanceOption = (typeof RELEVANCE_OPTIONS)[number];

/** Versioned question for one task; results keep the exact version they were asked with. */
export const QuestionSpec = z.object({
  task: z.enum(["evidence_sufficiency", "criterion_score", "candidate_relevance"]),
  primitive: z.enum(["noul", "choice", "score"]),
  version: z.number().int().min(1),
  question: z.string().min(1),
  options: z.array(z.object({ value: z.string(), definition: z.string() })).default([]),
  topThreshold: z.number().min(0).max(1),
  marginThreshold: z.number().min(0).max(1),
  contextTemplate: z.string(),
});
export type QuestionSpec = z.infer<typeof QuestionSpec>;

export const DEFAULT_QUESTION_SPECS: QuestionSpec[] = [
  {
    task: "evidence_sufficiency", primitive: "noul", version: 1, topThreshold: 0.6, marginThreshold: 0.15,
    question: "Apakah paket bukti cukup untuk menilai relevansi kandidat ini terhadap temuan?",
    options: [], contextTemplate: "temuan + metrik terukur + provenance + kandidat",
  },
  {
    task: "criterion_score", primitive: "score", version: 1, topThreshold: 0.6, marginThreshold: 0.15,
    question: "Berdasarkan bukti, berapa skor kandidat untuk kriteria rubrik ini?",
    options: [], contextTemplate: "kriteria + skala + bukti + kandidat",
  },
  {
    task: "candidate_relevance", primitive: "choice", version: 1, topThreshold: 0.6, marginThreshold: 0.15,
    question: "Seberapa relevan kandidat ini untuk menangani temuan, berdasarkan bukti saja?",
    options: [
      { value: "relevant", definition: "Kandidat langsung menangani gejala terukur pada temuan." },
      { value: "partly_relevant", definition: "Kandidat menangani sebagian gejala atau butuh syarat tambahan." },
      { value: "not_relevant", definition: "Kandidat tidak berkaitan dengan gejala terukur." },
      { value: "insufficient_information", definition: "Bukti tidak cukup untuk memutuskan." },
    ],
    contextTemplate: "temuan + skor kriteria + kandidat",
  },
];

// ---------------------------------------------------------------- adapter results (validated before storage)

const meta = {
  requestId: z.string().min(1),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  cost: z.number().nonnegative().nullable(),
};

export const NoulResult = z.object({ ...meta, probabilityYes: z.number().min(0).max(1) });
export type NoulResult = z.infer<typeof NoulResult>;

export const ChoiceResult = z.object({
  ...meta,
  distribution: z.array(z.object({ option: z.string(), probability: z.number().min(0).max(1) })).min(1),
}).refine((r) => Math.abs(r.distribution.reduce((s, d) => s + d.probability, 0) - 1) < 0.02, "probabilities must sum to 1");
export type ChoiceResult = z.infer<typeof ChoiceResult>;

export const ScoreResult = z.object({
  ...meta,
  score: z.number().int(),
  distribution: z.array(z.object({ value: z.number().int(), probability: z.number().min(0).max(1) })).min(1),
});
export type ScoreResult = z.infer<typeof ScoreResult>;

export interface DecisionRequest {
  question: string;
  /** structured evidence and candidate, never free text instructions */
  context: Record<string, unknown>;
  idempotencyKey: string;
}

export interface DecisionModelAdapter {
  readonly name: string;
  noul(req: DecisionRequest): Promise<{ result: NoulResult; raw: unknown }>;
  choice(req: DecisionRequest & { options: string[] }): Promise<{ result: ChoiceResult; raw: unknown }>;
  score(req: DecisionRequest & { scale: number[] }): Promise<{ result: ScoreResult; raw: unknown }>;
}

/** Same bundle, spec, model and candidate → same call; the provider is not asked twice. */
export const assessmentIdempotencyInput = (bundleHash: string, specVersion: string, modelVersion: string, candidateId: string) =>
  `${bundleHash}\n${specVersion}\n${modelVersion}\n${candidateId}`;

/** Code aggregation: Σ(normalized criterion score × weight). Missing criteria are never filled with defaults. */
export function aggregateScore(criteria: { key: string; weight: number; score: number | null; scale: number[] }[]): { total: number | null; missing: string[] } {
  const missing = criteria.filter((c) => c.score == null).map((c) => c.key);
  if (missing.length) return { total: null, missing };
  const total = criteria.reduce((s, c) => {
    const lo = Math.min(...c.scale), hi = Math.max(...c.scale);
    return s + (hi > lo ? ((c.score! - lo) / (hi - lo)) : 0) * c.weight;
  }, 0);
  return { total: Math.round(total * 10_000) / 10_000, missing };
}

/** needs_review when the top option is below threshold or too close to the runner-up. */
export function uncertainty(distribution: { probability: number }[], top: number, margin: number): { top: number; margin: number; uncertain: boolean } {
  const ps = distribution.map((d) => d.probability).sort((a, b) => b - a);
  const t = ps[0] ?? 0, m = t - (ps[1] ?? 0);
  return { top: t, margin: m, uncertain: t < top || m < margin };
}
