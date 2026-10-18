import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().trim().max(max);

export const CONTEXT_KINDS = ["process_boundary", "rework_definition", "rule", "calendar", "hypothesis", "intervention", "rubric"] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export const ConfigStatus = z.enum(["draft", "reviewed", "approved", "obsolete"]);
export type ConfigStatus = z.infer<typeof ConfigStatus>;

export const ProcessBoundary = z.object({
  startActivities: z.array(label).min(1, "Pilih minimal satu aktivitas awal"),
  endActivities: z.array(label).min(1, "Pilih minimal satu aktivitas akhir"),
});
export type ProcessBoundary = z.infer<typeof ProcessBoundary>;

export const ReworkRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("repeated_activity"), activity: label, minOccurrences: z.number().int().min(2).max(50).default(2) }),
  z.object({ type: z.literal("return_transition"), from: label, to: label }),
  z.object({ type: z.literal("semantic_category"), category: label }),
  z.object({ type: z.literal("sequence_pattern"), sequence: z.array(label).min(2).max(10) }),
]);
export type ReworkRule = z.infer<typeof ReworkRule>;

export const ReworkDefinition = z.object({ rules: z.array(ReworkRule).min(1).max(20) });
export type ReworkDefinition = z.infer<typeof ReworkDefinition>;

export const RuleType = z.enum(["sla_duration", "ordering", "required_activity", "forbidden_activity", "separation_of_duties"]);

export const RuleParams = z.discriminatedUnion("type", [
  /** from/to omitted = whole case (first to last event) */
  z.object({ type: z.literal("sla_duration"), fromActivity: label.nullish(), toActivity: label.nullish(), maxHours: z.number().positive().max(100_000) }),
  z.object({ type: z.literal("ordering"), before: label, after: label }),
  z.object({ type: z.literal("required_activity"), activity: label }),
  z.object({ type: z.literal("forbidden_activity"), activity: label }),
  z.object({ type: z.literal("separation_of_duties"), activityA: label, activityB: label }),
]);
export type RuleParams = z.infer<typeof RuleParams>;

export const RulePayload = z.object({
  name: label,
  params: RuleParams,
  /** optional case attribute filter, e.g. {"Cabang": ["Jakarta"]} */
  scope: z.record(z.string(), z.array(z.string())).default({}),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export type RulePayload = z.infer<typeof RulePayload>;

export const Calendar = z.object({
  timezone: z.string().min(1).max(64),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1),
  workStart: z.string().regex(/^\d{2}:\d{2}$/),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).default([]),
});
export type Calendar = z.infer<typeof Calendar>;

/** Condition references a capability, metric/finding value, case attribute, rule status, or activity presence. */
export const Condition = z.object({
  ref: z.enum(["capability", "metric", "finding", "case_attribute", "rule_status", "activity"]),
  key: label,
  op: z.enum(["=", "!=", ">", ">=", "<", "<=", "in", "exists"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).nullish(),
});
export type Condition = z.infer<typeof Condition>;

export const Hypothesis = z.object({
  statement: text(1000).min(1),
  symptoms: z.array(text(300).min(1)).max(20).default([]),
  /** finding types this hypothesis may explain, e.g. bottleneck_indication */
  findingTypes: z.array(z.string()).max(10).default([]),
  /** activities/transitions it is about; empty = any */
  activities: z.array(label).max(20).default([]),
  requiredEvidence: z.array(text(300).min(1)).max(20).default([]),
  conditions: z.array(Condition).max(20).default([]),
});
export type Hypothesis = z.infer<typeof Hypothesis>;

export const Intervention = z.object({
  action: text(1000).min(1),
  addressedHypotheses: z.array(z.string()).max(20).default([]),
  findingTypes: z.array(z.string()).max(10).default([]),
  activities: z.array(label).max(20).default([]),
  prerequisites: z.array(text(300).min(1)).max(20).default([]),
  effort: z.number().int().min(1).max(5).nullish(),
  risk: z.number().int().min(1).max(5).nullish(),
  exclusions: z.array(text(300).min(1)).max(20).default([]),
  ownerRole: text(120).default(""),
  successMetric: text(300).default(""),
  requiredCapabilities: z.array(z.string()).max(10).default([]),
  conditions: z.array(Condition).max(20).default([]),
});
export type Intervention = z.infer<typeof Intervention>;

export const RubricCriterion = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  name: label,
  weight: z.number().positive().max(1),
  scale: z.array(z.object({ value: z.number().int().min(0).max(10), label: label, definition: text(500) })).min(2).max(11),
});

export const Rubric = z.object({
  name: label,
  criteria: z.array(RubricCriterion).min(1).max(12),
  insufficientInformation: text(500).default("Bukti tidak cukup untuk menilai kriteria ini."),
}).refine((r) => Math.abs(r.criteria.reduce((s, c) => s + c.weight, 0) - 1) < 1e-6, { message: "Bobot kriteria harus berjumlah 1", path: ["criteria"] })
  .refine((r) => new Set(r.criteria.map((c) => c.key)).size === r.criteria.length, { message: "Key kriteria harus unik", path: ["criteria"] });
export type Rubric = z.infer<typeof Rubric>;

export const CONTEXT_PAYLOAD = {
  process_boundary: ProcessBoundary,
  rework_definition: ReworkDefinition,
  rule: RulePayload,
  calendar: Calendar,
  hypothesis: Hypothesis,
  intervention: Intervention,
  rubric: Rubric,
} as const;

/** Reference catalog file a user can import (JSON). Keys are stable across versions. */
export const CatalogImport = z.object({
  hypotheses: z.array(z.object({ key: z.string().min(1).max(80), payload: Hypothesis })).max(500).default([]),
  interventions: z.array(z.object({ key: z.string().min(1).max(80), payload: Intervention })).max(500).default([]),
  rubrics: z.array(z.object({ key: z.string().min(1).max(80), payload: Rubric })).max(20).default([]),
});
export type CatalogImport = z.infer<typeof CatalogImport>;

// ---------------------------------------------------------------- worker contracts

export const ValidateBpmnInput = z.object({ projectId: z.uuid(), modelId: z.uuid(), objectKey: z.string().min(1).max(512) });
export type ValidateBpmnInput = z.infer<typeof ValidateBpmnInput>;

export const ValidateBpmnResult = z.object({
  valid: z.boolean(),
  /** parsed safely; a model can be readable (for display) yet fail PM4Py conversion */
  readable: z.boolean(),
  tasks: z.array(z.object({ id: z.string(), name: z.string() })),
  elementCount: z.number().int(),
  error: z.string().nullable(),
  pm4py: z.object({ places: z.number().int(), transitions: z.number().int() }).nullable(),
});
export type ValidateBpmnResult = z.infer<typeof ValidateBpmnResult>;

export const PreviewRuleInput = z.object({
  projectId: z.uuid(),
  eventsKey: z.string().min(1).max(512),
  rule: RulePayload,
  maxCases: z.number().int().min(1).max(100_000),
});
export type PreviewRuleInput = z.infer<typeof PreviewRuleInput>;

export const PreviewRuleResult = z.object({
  evaluatedCases: z.number().int(),
  compliant: z.number().int(),
  nonCompliant: z.number().int(),
  notEvaluable: z.number().int(),
  reasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  samples: z.array(z.object({ caseId: z.string(), status: z.string(), reason: z.string().nullable() })),
});
export type PreviewRuleResult = z.infer<typeof PreviewRuleResult>;
