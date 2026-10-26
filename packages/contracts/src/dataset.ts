import { z } from "zod";

const uuid = z.uuid();
const key = z.string().min(1).max(512);

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
export const CANONICAL_ALGORITHM_VERSION = "canonical-v1";

export const SnapshotStatus = z.enum(["awaiting_upload", "validating", "ready_for_mapping", "needs_review", "failed", "cancelled"]);
export type SnapshotStatus = z.infer<typeof SnapshotStatus>;

export const DatasetStatus = z.enum(["draft", "processing", "quality_review", "published", "superseded", "failed"]);
export type DatasetStatus = z.infer<typeof DatasetStatus>;

export const QualityStatus = z.enum(["ready", "ready_with_notes", "not_ready"]);
export type QualityStatus = z.infer<typeof QualityStatus>;

/** Python ingest: raw object → staging Parquet + an ingest report written next to it. */
export const IngestSnapshotInput = z.object({
  projectId: uuid,
  snapshotId: uuid,
  rawKey: key,
  stagingKey: key,
  reportKey: key,
  fileName: z.string().max(260),
  maxBytes: z.number().int().positive(),
});
export type IngestSnapshotInput = z.infer<typeof IngestSnapshotInput>;

export const IngestReport = z.object({
  status: z.enum(["ready_for_mapping", "needs_review", "failed"]),
  format: z.enum(["csv", "xes", "xes.gz", "zip/csv", "zip/xes"]).nullable(),
  encoding: z.string().nullable(),
  delimiter: z.string().nullable(),
  rowCount: z.number().int(),
  columns: z.array(z.string()),
  preview: z.array(z.record(z.string(), z.string().nullable())),
  errorSamples: z.array(z.object({ row: z.number().int().nullable(), message: z.string() })),
  invalidRowCount: z.number().int(),
  reviewReasons: z.array(z.string()),
  suggestedMapping: z.record(z.string(), z.string()),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type IngestReport = z.infer<typeof IngestReport>;

export const RepairRule = z.object({
  type: z.literal("exclude_invalid"),
  /** which defects exclude an event */
  checks: z.array(z.enum(["required_missing", "timestamp_invalid", "start_after_completion"])).min(1),
});
export type RepairRule = z.infer<typeof RepairRule>;

const column = z.string().min(1).max(200);

export const MappingConfig = z.object({
  columns: z.object({
    caseId: column,
    activity: column,
    timestamp: column,
    startTimestamp: column.nullish(),
    resource: column.nullish(),
    eventId: column.nullish(),
    lifecycle: column.nullish(),
    caseAttributes: z.array(column).max(50).default([]),
    eventAttributes: z.array(column).max(50).default([]),
    objectRefs: z.array(column).max(10).default([]),
  }),
  /** strftime pattern (e.g. "%d/%m/%Y %H:%M") or "auto" for ISO 8601 */
  timestampFormat: z.string().min(1).max(64).default("auto"),
  /** IANA zone applied to timestamps without an explicit offset */
  timezone: z.string().min(1).max(64),
  /** extra column to separate otherwise identical events in the fingerprint */
  discriminator: column.nullish(),
  /** raw activity label → canonical label; unlisted labels keep their raw text */
  labelMap: z.record(z.string(), z.string().min(1).max(200)).default({}),
  /** when true, a raw label missing from a non-empty labelMap is a quality finding */
  requireLabelMap: z.boolean().default(false),
  repairRules: z.array(RepairRule).max(10).default([]),
});
export type MappingConfig = z.infer<typeof MappingConfig>;

export const PreviewMappingInput = z.object({
  projectId: uuid,
  stagingKey: key,
  config: MappingConfig,
  limit: z.number().int().min(1).max(50),
});
export type PreviewMappingInput = z.infer<typeof PreviewMappingInput>;

export const PreviewEvent = z.object({
  row: z.number().int(),
  caseId: z.string().nullable(),
  activityRaw: z.string().nullable(),
  activity: z.string().nullable(),
  timeUtc: z.string().nullable(),
  startTimeUtc: z.string().nullable(),
  resource: z.string().nullable(),
  issues: z.array(z.string()),
});

export const PreviewMappingResult = z.object({
  events: z.array(PreviewEvent),
  activityValues: z.array(z.object({ raw: z.string(), count: z.number().int() })),
  totalRows: z.number().int(),
  parsedTimestampShare: z.number(),
});
export type PreviewMappingResult = z.infer<typeof PreviewMappingResult>;

export const BuildDatasetInput = z.object({
  projectId: uuid,
  datasetVersionId: uuid,
  sourceId: uuid,
  snapshotId: uuid,
  mappingVersionId: uuid,
  stagingKey: key,
  eventsKey: key,
  casesKey: key,
  reportKey: key,
  config: MappingConfig,
  projectPeriod: z.object({ start: z.string(), end: z.string() }),
  /** filled once F03 provides a process boundary; null keeps incomplete-case checks off */
  processBoundary: z.object({ startActivities: z.array(z.string()), endActivities: z.array(z.string()) }).nullable(),
});
export type BuildDatasetInput = z.infer<typeof BuildDatasetInput>;

export const QualityFinding = z.object({
  check: z.string(),
  severity: z.enum(["high", "medium", "info"]),
  eventCount: z.number().int(),
  caseCount: z.number().int(),
  eventShare: z.number(),
  caseShare: z.number(),
  excludedEventCount: z.number().int(),
  samples: z.array(z.object({ row: z.number().int().nullable(), eventId: z.string().nullable(), caseId: z.string().nullable(), activity: z.string().nullable(), detail: z.string().nullable() })),
});
export type QualityFinding = z.infer<typeof QualityFinding>;

export const Capability = z.object({ available: z.boolean(), level: z.enum(["ok", "warning", "unavailable"]), reason: z.string() });

export const BuildDatasetReport = z.object({
  eventCount: z.number().int(),
  caseCount: z.number().int(),
  excludedEventCount: z.number().int(),
  activityLabels: z.array(z.object({ label: z.string(), count: z.number().int() })),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  findings: z.array(QualityFinding),
  qualityStatus: QualityStatus,
  capabilities: z.record(z.string(), Capability),
});
export type BuildDatasetReport = z.infer<typeof BuildDatasetReport>;
