import "server-only";
import { createHash } from "node:crypto";
import { DEFAULT_MONITORING_CONFIG, MONITORING_ALGORITHM_VERSION, normalizeFilter, PROCESS_ALGORITHM_VERSION, type MappingConfig, type ProcessMapResult } from "@nora/contracts";
import { advisoryLock, jsonAs, plain, Prisma } from "@nora/db";
import { getJson } from "@nora/storage";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { stableStringify } from "./data";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { plain as plainRow, readRows } from "./parquet";
import { can } from "./projects";

export const ALGORITHM_VERSION = `${PROCESS_ALGORITHM_VERSION}+${MONITORING_ALGORITHM_VERSION}`;

type MonitoringConfig = typeof DEFAULT_MONITORING_CONFIG;

/** Thresholds are part of the key: a changed monitoring config is a different analysis, not a silent reuse. */
export const analysisKey = (datasetHash: string, packageHash: string, filter: unknown, monitoringConfig: unknown = DEFAULT_MONITORING_CONFIG, algorithm = ALGORITHM_VERSION) =>
  createHash("sha256").update(`${datasetHash}\n${packageHash}\n${stableStringify(normalizeFilter(filter))}\n${stableStringify(monitoringConfig)}\n${algorithm}`).digest("hex");

export async function currentMonitoringConfig(projectId: string): Promise<{ id: string | null; version: number; config: MonitoringConfig }> {
  const row = await db().monitoringConfig.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { id: true, version: true, config: true } });
  return row ? { ...row, config: jsonAs<MonitoringConfig>(row.config) } : { id: null, version: 0, config: DEFAULT_MONITORING_CONFIG };
}

const publishedDataset = (projectId: string) =>
  db().datasetVersion.findFirst({ where: { projectId, status: "published" }, orderBy: { publishedAt: "desc" }, select: { id: true, contentHash: true } });
const activePackage = (projectId: string) => db().contextPackage.findFirst({ where: { projectId, status: "active" }, select: { id: true, hash: true } });

export async function requestAnalysis(viewer: Viewer, projectId: string, input: { filterSpec?: unknown; datasetVersionId?: string; contextPackageId?: string }, correlationId: string) {
  await can(viewer, "analysis.run", projectId);
  let filter;
  try { filter = normalizeFilter(input.filterSpec ?? {}); } catch { throw badRequest("Filter tidak valid"); }
  // Analysis only ever runs on a published (or superseded) dataset and an active (or superseded) context package.
  const ds = input.datasetVersionId
    ? await db().datasetVersion.findFirst({ where: { id: input.datasetVersionId, projectId, status: { in: ["published", "superseded"] } }, select: { id: true, contentHash: true } })
    : await publishedDataset(projectId);
  const pkg = input.contextPackageId
    ? await db().contextPackage.findFirst({ where: { id: input.contextPackageId, projectId, status: { in: ["active", "superseded"] } }, select: { id: true, hash: true } })
    : await activePackage(projectId);
  if (!ds) throw conflict("Belum ada dataset terbit");
  if (!pkg) throw conflict("Belum ada paket konteks aktif");
  const mon = await currentMonitoringConfig(projectId);
  const key = analysisKey(ds.contentHash, pkg.hash, filter, mon.config);
  const r = await withTx(async (tx) => {
    await advisoryLock(tx, `analysis:${projectId}:${key}`);
    // Same inputs, same algorithm: reuse the finished (or running) run instead of computing again.
    const existing = await tx.analysisRun.findFirst({
      where: { projectId, analysisKey: key, status: { in: ["queued", "running", "result_ready", "completed"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true },
    });
    if (existing) return { id: existing.id, reused: true, status: existing.status };
    const id = crypto.randomUUID();
    await tx.analysisRun.create({
      data: {
        id, projectId, datasetVersionId: ds.id, contextPackageId: pkg.id, filterSpec: filter, algorithmVersion: ALGORITHM_VERSION, analysisKey: key,
        artifactPrefix: `projects/${projectId}/analyses/${id}`, requestedBy: viewer.id, monitoringConfigId: mon.id, monitoringConfig: mon.config,
      },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: "analysis.request", objectType: "analysis_run", objectId: id, correlationId, metadata: { datasetVersionId: ds.id, contextPackageId: pkg.id, analysisKey: key } });
    return { id, reused: false, status: "queued" };
  });
  if (!r.reused) await startJob("processAnalysisWorkflow", r.id, [{ projectId, analysisRunId: r.id, requestedBy: viewer.id, correlationId }]);
  return r;
}

export interface RunRow {
  id: string;
  status: string;
  datasetVersionId: string;
  datasetName: string;
  contextPackageId: string;
  contextName: string;
  filterSpec: ReturnType<typeof normalizeFilter>;
  algorithmVersion: string;
  analysisKey: string;
  coverage: (ProcessMapResult["coverage"] & { mapAvailable: boolean; unavailableReason: string | null; caseDuration: ProcessMapResult["caseDuration"] }) | null;
  warnings: string[];
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  projectStatusChanged: boolean;
  datasetIsCurrent: boolean;
  contextIsCurrent: boolean;
  monitoringStatus: "pending" | "running" | "completed" | "failed";
  monitoringError: string | null;
  monitoringConfig: MonitoringConfig | null;
}

const RUN_SELECT = {
  id: true, status: true, datasetVersionId: true, contextPackageId: true, filterSpec: true, algorithmVersion: true, analysisKey: true, coverage: true, warnings: true,
  errorMessage: true, createdAt: true, completedAt: true, projectStatusChanged: true, monitoringStatus: true, monitoringError: true, monitoringConfig: true,
  datasetVersion: { select: { name: true, status: true } }, contextPackage: { select: { name: true, status: true } },
} as const satisfies Prisma.AnalysisRunSelect;

const toRunRow = ({ datasetVersion: d, contextPackage: c, ...r }: Prisma.AnalysisRunGetPayload<{ select: typeof RUN_SELECT }>): RunRow => ({
  ...r, datasetName: d.name, contextName: c.name, datasetIsCurrent: d.status === "published", contextIsCurrent: c.status === "active",
  filterSpec: jsonAs<RunRow["filterSpec"]>(r.filterSpec), coverage: jsonAs<RunRow["coverage"]>(r.coverage), warnings: jsonAs<string[]>(r.warnings),
  monitoringConfig: jsonAs<MonitoringConfig | null>(r.monitoringConfig), monitoringStatus: r.monitoringStatus as RunRow["monitoringStatus"],
  createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null,
});

export async function listRuns(viewer: Viewer, projectId: string): Promise<RunRow[]> {
  await can(viewer, "project.read", projectId);
  const rows = await db().analysisRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50, select: RUN_SELECT });
  return rows.map(toRunRow);
}

export async function getRun(viewer: Viewer, projectId: string, runId: string): Promise<RunRow> {
  await can(viewer, "project.read", projectId);
  const row = await db().analysisRun.findFirst({ where: { id: runId, projectId }, select: RUN_SELECT });
  if (!row) throw notFound();
  return toRunRow(row);
}

export async function getMap(viewer: Viewer, projectId: string, runId: string): Promise<ProcessMapResult & { warnings: string[] }> {
  const run = await getRun(viewer, projectId, runId);
  if (run.status !== "result_ready" && run.status !== "completed") throw conflict("Hasil analisis belum tersedia");
  return getJson(projectId, `projects/${projectId}/analyses/${runId}/map.json`);
}

export async function listVariants(viewer: Viewer, projectId: string, runId: string) {
  await getRun(viewer, projectId, runId);
  const rows = await db().variant.findMany({
    where: { runId }, orderBy: { rank: "asc" }, take: 500,
    select: { rank: true, sequenceHash: true, sequence: true, caseCount: true, share: true, cumulativeShare: true, medianDurationS: true },
  });
  return rows.map((v) => ({
    rank: v.rank, hash: v.sequenceHash, sequence: jsonAs<string[]>(v.sequence), caseCount: Number(v.caseCount), share: v.share,
    cumulativeShare: v.cumulativeShare, medianDurationSeconds: v.medianDurationS,
  }));
}

export const CASE_SORTS = { duration: '"durationSeconds"', events: '"eventCount"', start: '"startTime"', wait: "sel_wait" } as const;
export const PAGE_MAX = 100;

export interface CaseQuery {
  node?: string | null;
  from?: string | null;
  to?: string | null;
  caseUids?: string[] | null;
  sort?: keyof typeof CASE_SORTS;
  dir?: "asc" | "desc";
  page?: number;
  size?: number;
}

export interface CaseRow {
  caseUid: string;
  caseId: string;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number | null;
  eventCount: number;
  variantHash: string;
  selectedWaitSeconds: number | null;
}

/** Cases behind a node, an edge (incl. start/end markers), or an explicit set; count matches the map aggregates. */
export async function listCases(viewer: Viewer, projectId: string, runId: string, q: CaseQuery) {
  await getRun(viewer, projectId, runId);
  const size = Math.min(Math.max(q.size ?? 25, 1), PAGE_MAX);
  const page = Math.max(q.page ?? 1, 1);
  // Raw: the filter (node, edge, start/end marker) and the sort column are chosen per request.
  let filter = Prisma.empty;
  let selWait = Prisma.sql`NULL::float8`;
  if (q.from && q.to) {
    if (q.from === "__start") filter = Prisma.sql`AND c.first_activity = ${q.to}`;
    else if (q.to === "__end") filter = Prisma.sql`AND c.last_activity = ${q.from}`;
    else {
      const edge = Prisma.sql`e.run_id = c.run_id AND e.case_uid = c.case_uid AND e.from_activity = ${q.from} AND e.to_activity = ${q.to}`;
      filter = Prisma.sql`AND EXISTS (SELECT 1 FROM analysis_case_edges e WHERE ${edge})`;
      selWait = Prisma.sql`(SELECT e.max_wait_s FROM analysis_case_edges e WHERE ${edge})`;
    }
  } else if (q.node) {
    filter = Prisma.sql`AND EXISTS (SELECT 1 FROM analysis_case_nodes n WHERE n.run_id = c.run_id AND n.case_uid = c.case_uid AND n.activity = ${q.node})`;
  }
  if (q.caseUids) filter = Prisma.sql`${filter} AND c.case_uid = ANY(${q.caseUids}::text[])`;
  const edgeSelected = !!(q.from && q.to && q.from !== "__start" && q.to !== "__end");
  // Sorting by the selected edge's wait only makes sense when an edge is selected; the column comes from CASE_SORTS only.
  const sortCol = Prisma.raw(q.sort && CASE_SORTS[q.sort] && (q.sort !== "wait" || edgeSelected) ? CASE_SORTS[q.sort] : CASE_SORTS.duration);
  const dir = Prisma.raw(q.dir === "asc" ? "ASC" : "DESC");
  const [{ n: total }] = await db().$queryRaw<[{ n: bigint }]>`SELECT count(*) AS n FROM analysis_cases c WHERE c.run_id = ${runId}::uuid ${filter}`;
  const rows = await db().$queryRaw<{ caseUid: string; caseId: string; startTime: Date | null; endTime: Date | null; durationSeconds: number | null; eventCount: number; variantHash: string; sel_wait: number | null }[]>`
    SELECT * FROM (SELECT c.case_uid AS "caseUid", c.case_id AS "caseId", c.start_time AS "startTime", c.end_time AS "endTime", c.duration_s AS "durationSeconds",
           c.event_count AS "eventCount", c.variant_hash AS "variantHash", ${selWait} AS sel_wait
      FROM analysis_cases c WHERE c.run_id = ${runId}::uuid ${filter}) c
     ORDER BY ${sortCol} ${dir} NULLS LAST, "caseUid"
     LIMIT ${size} OFFSET ${(page - 1) * size}`;
  const cases: CaseRow[] = rows.map(({ sel_wait, ...r }) => ({ ...plain(r), selectedWaitSeconds: sel_wait }));
  return { total: Number(total), page, size, cases };
}

/** One event row of the dataset Parquet, as the timeline reads it (attributes are JSON-decoded). */
export type TimelineEvent = {
  event_uid: string; case_id: string; case_uid: string; activity: string; activity_raw: string; event_time_utc: string; start_time_utc: string | null;
  resource: string | null; lifecycle: string | null; case_attributes: Record<string, unknown>; event_attributes: Record<string, unknown>; object_refs: unknown;
  snapshot_id: string; source_row_number: number; original_event_id: string | null; mapping_version_id: string; quality_flags: string[]; excluded: boolean; row_index: number;
};

const TIMELINE_COLS = ["event_uid", "case_id", "case_uid", "activity", "activity_raw", "event_time_utc", "start_time_utc", "resource", "lifecycle", "case_attributes", "event_attributes",
  "object_refs", "snapshot_id", "source_row_number", "original_event_id", "mapping_version_id", "quality_flags", "excluded", "row_index"];

/** One case's events (including excluded ones, flagged) read from the dataset Parquet by row range. */
export async function caseTimeline(viewer: Viewer, projectId: string, datasetId: string, caseUid: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f]{16}$/.test(caseUid)) throw notFound();
  const ds = await db().datasetVersion.findFirst({
    where: { id: datasetId, projectId },
    select: { eventsKey: true, casesKey: true, snapshotId: true, snapshot: { select: { fileName: true } }, source: { select: { name: true } }, mappingVersion: { select: { version: true, config: true } } },
  });
  if (!ds) throw notFound();
  const indexed = await db().analysisCase.findFirst({ where: { caseUid, run: { datasetVersionId: datasetId } }, select: { rowStart: true, rowEnd: true } });
  let range = indexed && { start: Number(indexed.rowStart), end: Number(indexed.rowEnd) };
  if (!range) {
    // No analysis has indexed this case yet: fall back to the dataset's own case index.
    const cases = await readRows(projectId, ds.casesKey, { rowStart: 0, rowEnd: Number.MAX_SAFE_INTEGER, columns: ["case_uid", "row_start", "row_end"] });
    const hit = cases.find((c) => c.case_uid === caseUid);
    if (!hit) throw notFound();
    range = { start: Number(hit.row_start), end: Number(hit.row_end) };
  }
  // Parquet rows carry exactly the TIMELINE_COLS columns written by the dataset build.
  const events = (await readRows(projectId, ds.eventsKey, { rowStart: range.start, rowEnd: range.end + 1, columns: TIMELINE_COLS }))
    .map(plainRow).filter((e) => e.case_uid === caseUid)
    .map((e) => ({ ...e, case_attributes: safeJson(e.case_attributes), event_attributes: safeJson(e.event_attributes) }) as TimelineEvent);
  if (!events.length) throw notFound();
  return {
    caseUid, caseId: events[0]!.case_id, datasetVersionId: datasetId,
    source: {
      name: ds.source.name, snapshotId: ds.snapshotId, fileName: ds.snapshot.fileName, mappingVersion: ds.mappingVersion.version,
      sourceTimezone: jsonAs<Partial<MappingConfig>>(ds.mappingVersion.config).timezone ?? null,
    },
    events,
  };
}

const safeJson = (v: unknown): unknown => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return {}; } };
