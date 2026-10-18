import { z } from "zod";

export const EVIDENCE_ALGORITHM_VERSION = "evidence-v1";

export const EvidenceBundleRequest = z.object({
  projectId: z.uuid(),
  targetType: z.enum(["finding", "candidate_comparison", "assessment"]),
  targetId: z.uuid(),
  purpose: z.enum(["jev_assessment", "llm_interpretation"]),
  requestedBy: z.uuid(),
  correlationId: z.string().min(1).max(100),
  maxItems: z.number().int().min(1).max(200).default(40),
  maxEstimatedTokens: z.number().int().min(100).max(100_000).default(6000),
  /** extra items a caller needs (e.g. a candidate under assessment) */
  focusCandidateId: z.uuid().nullish(),
});
export type EvidenceBundleRequest = z.infer<typeof EvidenceBundleRequest>;

export const EvidenceItem = z.object({
  ordinal: z.number().int(),
  itemType: z.string(),
  itemId: z.string(),
  itemVersion: z.string().nullable(),
  relationPath: z.string(),
  priority: z.number().int(),
  included: z.boolean(),
  exclusionReason: z.string().nullable(),
  estimatedTokens: z.number().int(),
  contentRef: z.string().nullable(),
  /** present only for included items; measured values keep their unit */
  content: z.record(z.string(), z.unknown()).nullable(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const EvidenceBundle = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  targetType: z.string(),
  targetId: z.uuid(),
  purpose: z.string(),
  graphSequence: z.number().int(),
  hash: z.string(),
  contextLimited: z.boolean(),
  contextMaybeStale: z.boolean(),
  algorithmVersion: z.string(),
  items: z.array(EvidenceItem),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;
