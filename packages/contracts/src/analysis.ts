import { z } from "zod";

export const PROCESS_ALGORITHM_VERSION = "dfg-v1";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

/** Versioned filter contract. The focused UI exposes period and one attribute; the rest stays available. */
export const FilterSpec = z.object({
  version: z.literal(1).default(1),
  period: z.object({ from: iso.nullish(), to: iso.nullish() }).nullish(),
  attribute: z.object({ key: z.string().min(1).max(200), values: z.array(z.string().max(200)).min(1).max(100) }).nullish(),
  activityPresent: z.array(z.string().max(200)).max(20).default([]),
  activityAbsent: z.array(z.string().max(200)).max(20).default([]),
  variants: z.array(z.string().regex(/^[0-9a-f]{16,64}$/)).max(50).default([]),
  duration: z.object({ minSeconds: z.number().nonnegative().nullish(), maxSeconds: z.number().nonnegative().nullish() }).nullish(),
  completion: z.enum(["all", "complete", "incomplete"]).default("all"),
  objectRef: z.string().max(200).nullish(),
});
export type FilterSpec = z.infer<typeof FilterSpec>;

/** Canonical form for hashing: defaults applied, empty filters dropped, arrays sorted. */
export function normalizeFilter(input: unknown): FilterSpec {
  const f = FilterSpec.parse(input ?? {});
  const sorted = (xs: string[]) => [...new Set(xs)].sort();
  return {
    version: 1,
    period: f.period && (f.period.from || f.period.to) ? { from: f.period.from ?? null, to: f.period.to ?? null } : null,
    attribute: f.attribute ? { key: f.attribute.key, values: sorted(f.attribute.values) } : null,
    activityPresent: sorted(f.activityPresent),
    activityAbsent: sorted(f.activityAbsent),
    variants: sorted(f.variants),
    duration: f.duration && (f.duration.minSeconds != null || f.duration.maxSeconds != null) ? { minSeconds: f.duration.minSeconds ?? null, maxSeconds: f.duration.maxSeconds ?? null } : null,
    completion: f.completion,
    objectRef: f.objectRef || null,
  };
}

export const ProcessAnalysisInput = z.object({
  projectId: z.uuid(),
  analysisRunId: z.uuid(),
  eventsKey: z.string().min(1).max(512),
  artifactPrefix: z.string().min(1).max(512),
  filter: FilterSpec,
  boundary: z.object({ startActivities: z.array(z.string()), endActivities: z.array(z.string()) }).nullable(),
  caseAttributeKeys: z.array(z.string()).max(50),
});
export type ProcessAnalysisInput = z.infer<typeof ProcessAnalysisInput>;

export const ProcessAnalysisManifest = z.object({
  mapKey: z.string(),
  variantsKey: z.string(),
  caseIndexKey: z.string(),
  caseRowsKey: z.string(),
  caseCount: z.number().int(),
  eventCount: z.number().int(),
  mapAvailable: z.boolean(),
});
export type ProcessAnalysisManifest = z.infer<typeof ProcessAnalysisManifest>;

export const MapNode = z.object({
  id: z.string(),
  label: z.string(),
  eventCount: z.number().int(),
  caseCount: z.number().int(),
  caseShare: z.number(),
  startCount: z.number().int(),
  endCount: z.number().int(),
  boundaryStart: z.boolean(),
  boundaryEnd: z.boolean(),
  serviceMedianSeconds: z.number().nullable(),
});
export const MapEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  count: z.number().int(),
  caseCount: z.number().int(),
  medianSeconds: z.number(),
  p90Seconds: z.number(),
  totalSeconds: z.number(),
  contributionShare: z.number(),
});
export const ProcessMapResult = z.object({
  nodes: z.array(MapNode),
  edges: z.array(MapEdge),
  coverage: z.object({
    datasetCases: z.number().int(),
    datasetEvents: z.number().int(),
    cases: z.number().int(),
    events: z.number().int(),
    excludedEvents: z.number().int(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
  }),
  startSource: z.enum(["context", "observed"]),
  mapAvailable: z.boolean(),
  unavailableReason: z.string().nullable(),
  hasStartTime: z.boolean(),
  attributeValues: z.record(z.string(), z.array(z.object({ value: z.string(), count: z.number().int() }))),
  variants: z.array(z.object({ hash: z.string(), sequence: z.array(z.string()), caseCount: z.number().int(), share: z.number(), cumulativeShare: z.number(), medianDurationSeconds: z.number() })),
  caseDuration: z.object({ medianSeconds: z.number().nullable(), p90Seconds: z.number().nullable(), meanSeconds: z.number().nullable() }),
});
export type ProcessMapResult = z.infer<typeof ProcessMapResult>;
