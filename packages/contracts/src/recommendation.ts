import { z } from "zod";
import { Condition } from "./context.ts";

export const PRIORITY_COMPONENTS = ["relevance", "problemMagnitude", "evidenceConfidence", "effort", "risk"] as const;
export type PriorityComponent = (typeof PRIORITY_COMPONENTS)[number];

/** priority = 0.30 relevance + 0.30 magnitude + 0.15 confidence − 0.15 effort − 0.10 risk (components in 0..1). */
export const PriorityWeights = z.object({
  relevance: z.number().min(0).max(1),
  problemMagnitude: z.number().min(0).max(1),
  evidenceConfidence: z.number().min(0).max(1),
  effort: z.number().min(-1).max(0),
  risk: z.number().min(-1).max(0),
});
export type PriorityWeights = z.infer<typeof PriorityWeights>;
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = { relevance: 0.3, problemMagnitude: 0.3, evidenceConfidence: 0.15, effort: -0.15, risk: -0.1 };

/**
 * Missing components are never defaulted: their weight leaves numerator and denominator and the remaining
 * weights are renormalised by Σ|w|; the result is flagged partial with the missing list.
 */
export function priorityScore(components: Record<PriorityComponent, number | null>, weights: PriorityWeights) {
  const missing = PRIORITY_COMPONENTS.filter((k) => components[k] == null);
  const used = PRIORITY_COMPONENTS.filter((k) => components[k] != null);
  const denom = used.reduce((s, k) => s + Math.abs(weights[k]), 0);
  if (!used.length || denom === 0) return { score: null, partial: true, missing, effectiveWeights: {} as Record<string, number> };
  const effectiveWeights = Object.fromEntries(used.map((k) => [k, weights[k] / denom]));
  const score = used.reduce((s, k) => s + weights[k] * components[k]!, 0) / denom;
  return { score: Math.round(score * 10_000) / 10_000, partial: missing.length > 0, missing, effectiveWeights };
}

export const VALIDATION_STATUS_ORDER = ["not_eligible", "insufficient_information", "needs_review", "validated"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUS_ORDER)[number];

/** The heaviest failure wins: not_eligible > insufficient_information > needs_review > validated. */
export function finalValidationStatus(failures: (ValidationStatus | null)[]): ValidationStatus {
  for (const s of VALIDATION_STATUS_ORDER) if (failures.includes(s)) return s;
  return "validated";
}

/** 1..5 catalog scale to 0..1; anything else is missing, not zero. */
export const normalizeFiveScale = (v: number | null | undefined) => (v == null || v < 1 || v > 5 ? null : (v - 1) / 4);

export const AnalystCandidateInput = z.object({
  findingId: z.uuid(),
  description: z.string().trim().min(1, "Deskripsi wajib diisi").max(1000),
  addressedProblem: z.string().trim().min(1, "Masalah yang ditangani wajib diisi").max(500),
  successMetric: z.string().trim().min(1, "Metrik keberhasilan wajib diisi").max(300),
  sourceReason: z.string().trim().min(1, "Sumber atau alasan wajib diisi").max(500),
  ownerRole: z.string().trim().max(120).default(""),
  effort: z.number().int().min(1).max(5).nullish(),
  risk: z.number().int().min(1).max(5).nullish(),
  prerequisites: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  exclusions: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  conditions: z.array(Condition).max(20).default([]),
});
export type AnalystCandidateInput = z.infer<typeof AnalystCandidateInput>;
