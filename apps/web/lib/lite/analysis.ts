import "server-only";
import { createHash } from "node:crypto";
import { normalizeFilter, PROCESS_ALGORITHM_VERSION, type ProcessMapResult } from "@nora/contracts";
import { getJson } from "@nora/storage";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { stableStringify } from "./data";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { plain, readRows } from "./parquet";
import { can } from "./projects";

export const analysisKey = (datasetHash: string, packageHash: string, filter: unknown, algorithm = PROCESS_ALGORITHM_VERSION) =>
  createHash("sha256").update(`${datasetHash}\n${packageHash}\n${stableStringify(normalizeFilter(filter))}\n${algorithm}`).digest("hex");

/** Latest published dataset and active context package; analysis only ever runs on these kinds of records. */
async function activeInputs(projectId: string) {
  const ds = (await db().query<{ id: string; content_hash: string }>("SELECT id, content_hash FROM dataset_versions WHERE project_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1", [projectId])).rows[0];
  const pkg = (await db().query<{ id: string; hash: string }>("SELECT id, hash FROM context_packages WHERE project_id = $1 AND status = 'active' LIMIT 1", [projectId])).rows[0];
  return { ds, pkg };
}

export async function requestAnalysis(viewer: Viewer, projectId: string, input: { filterSpec?: unknown; datasetVersionId?: string; contextPackageId?: string }, correlationId: string) {
  await can(viewer, "analysis.run", projectId);
  let filter;
  try { filter = normalizeFilter(input.filterSpec ?? {}); } catch { throw badRequest("Filter tidak valid"); }
  const { ds: activeDs, pkg: activePkg } = await activeInputs(projectId);
  const ds = input.datasetVersionId
    ? (await db().query<{ id: string; content_hash: string }>("SELECT id, content_hash FROM dataset_versions WHERE id = $1 AND project_id = $2 AND status IN ('published', 'superseded')", [input.datasetVersionId, projectId])).rows[0]
    : activeDs;
  const pkg = input.contextPackageId
    ? (await db().query<{ id: string; hash: string }>("SELECT id, hash FROM context_packages WHERE id = $1 AND project_id = $2 AND status IN ('active', 'superseded')", [input.contextPackageId, projectId])).rows[0]
    : activePkg;
  if (!ds) throw conflict("Belum ada dataset terbit");
  if (!pkg) throw conflict("Belum ada paket konteks aktif");
  const key = analysisKey(ds.content_hash, pkg.hash, filter);
  return withTx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`analysis:${projectId}:${key}`]);
    // Same inputs, same algorithm: reuse the finished (or running) run instead of computing again.
    const existing = (await tx.query<{ id: string; status: string }>(
      "SELECT id, status FROM analysis_runs WHERE project_id = $1 AND analysis_key = $2 AND status IN ('queued', 'running', 'result_ready', 'completed') ORDER BY created_at DESC LIMIT 1", [projectId, key],
    )).rows[0];
    if (existing) return { id: existing.id, reused: true, status: existing.status };
    const id = crypto.randomUUID();
    await tx.query(
      `INSERT INTO analysis_runs (id, project_id, dataset_version_id, context_package_id, filter_spec, algorithm_version, analysis_key, artifact_prefix, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, projectId, ds.id, pkg.id, JSON.stringify(filter), PROCESS_ALGORITHM_VERSION, key, `projects/${projectId}/analyses/${id}`, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "analysis.request", objectType: "analysis_run", objectId: id, correlationId, metadata: { datasetVersionId: ds.id, contextPackageId: pkg.id, analysisKey: key } });
    return { id, reused: false, status: "queued" };
  }).then(async (r) => {
    if (!r.reused) await startJob("processAnalysisWorkflow", r.id, [{ projectId, analysisRunId: r.id, requestedBy: viewer.id, correlationId }]);
    return r;
  });
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
}

const RUN_COLS = `r.id, r.status, r.dataset_version_id AS "datasetVersionId", d.name AS "datasetName", r.context_package_id AS "contextPackageId", c.name AS "contextName",
  r.filter_spec AS "filterSpec", r.algorithm_version AS "algorithmVersion", r.analysis_key AS "analysisKey", r.coverage, r.warnings, r.error_message AS "errorMessage",
  r.created_at AS "createdAt", r.completed_at AS "completedAt", r.project_status_changed AS "projectStatusChanged",
  d.status = 'published' AS "datasetIsCurrent", c.status = 'active' AS "contextIsCurrent"`;

export async function listRuns(viewer: Viewer, projectId: string): Promise<RunRow[]> {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<RunRow>(
    `SELECT ${RUN_COLS} FROM analysis_runs r JOIN dataset_versions d ON d.id = r.dataset_version_id JOIN context_packages c ON c.id = r.context_package_id
      WHERE r.project_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [projectId],
  );
  return rows;
}

export async function getRun(viewer: Viewer, projectId: string, runId: string): Promise<RunRow> {
  await can(viewer, "project.read", projectId);
  const row = (await db().query<RunRow>(
    `SELECT ${RUN_COLS} FROM analysis_runs r JOIN dataset_versions d ON d.id = r.dataset_version_id JOIN context_packages c ON c.id = r.context_package_id
      WHERE r.id = $1 AND r.project_id = $2`, [runId, projectId],
  )).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function getMap(viewer: Viewer, projectId: string, runId: string): Promise<ProcessMapResult & { warnings: string[] }> {
  const run = await getRun(viewer, projectId, runId);
  if (run.status !== "result_ready" && run.status !== "completed") throw conflict("Hasil analisis belum tersedia");
  return getJson(projectId, `projects/${projectId}/analyses/${runId}/map.json`);
}

export async function listVariants(viewer: Viewer, projectId: string, runId: string) {
  await getRun(viewer, projectId, runId);
  const { rows } = await db().query(
    `SELECT rank, sequence_hash AS hash, sequence, case_count AS "caseCount", share, cumulative_share AS "cumulativeShare", median_duration_s AS "medianDurationSeconds"
       FROM variants WHERE run_id = $1 ORDER BY rank LIMIT 500`, [runId],
  );
  return rows;
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

/** Cases behind a node, an edge (incl. start/end markers), or an explicit set; count matches the map aggregates. */
export async function listCases(viewer: Viewer, projectId: string, runId: string, q: CaseQuery) {
  await getRun(viewer, projectId, runId);
  const size = Math.min(Math.max(q.size ?? 25, 1), PAGE_MAX);
  const page = Math.max(q.page ?? 1, 1);
  const params: unknown[] = [runId];
  let join = "";
  let selWait = "NULL::float8";
  if (q.from && q.to) {
    if (q.from === "__start") { params.push(q.to); join = `AND c.first_activity = $${params.length}`; }
    else if (q.to === "__end") { params.push(q.from); join = `AND c.last_activity = $${params.length}`; }
    else {
      params.push(q.from, q.to);
      join = `AND EXISTS (SELECT 1 FROM analysis_case_edges e WHERE e.run_id = c.run_id AND e.case_uid = c.case_uid AND e.from_activity = $${params.length - 1} AND e.to_activity = $${params.length})`;
      selWait = `(SELECT e.max_wait_s FROM analysis_case_edges e WHERE e.run_id = c.run_id AND e.case_uid = c.case_uid AND e.from_activity = $${params.length - 1} AND e.to_activity = $${params.length})`;
    }
  } else if (q.node) {
    params.push(q.node);
    join = `AND EXISTS (SELECT 1 FROM analysis_case_nodes n WHERE n.run_id = c.run_id AND n.case_uid = c.case_uid AND n.activity = $${params.length})`;
  }
  if (q.caseUids) { params.push(q.caseUids); join += ` AND c.case_uid = ANY($${params.length}::text[])`; }
  // Sorting by the selected edge's wait only makes sense when an edge is selected.
  const sortCol = q.sort && CASE_SORTS[q.sort] && (q.sort !== "wait" || selWait !== "NULL::float8") ? CASE_SORTS[q.sort] : CASE_SORTS.duration;
  const dir = q.dir === "asc" ? "ASC" : "DESC";
  const total = (await db().query<{ n: number }>(`SELECT count(*) AS n FROM analysis_cases c WHERE c.run_id = $1 ${join}`, params)).rows[0]!.n;
  const { rows } = await db().query(
    `SELECT * FROM (SELECT c.case_uid AS "caseUid", c.case_id AS "caseId", c.start_time AS "startTime", c.end_time AS "endTime", c.duration_s AS "durationSeconds",
            c.event_count AS "eventCount", c.variant_hash AS "variantHash", ${selWait} AS sel_wait
       FROM analysis_cases c WHERE c.run_id = $1 ${join}) c
      ORDER BY ${sortCol} ${dir} NULLS LAST, "caseUid"
      LIMIT ${size} OFFSET ${(page - 1) * size}`,
    params,
  );
  return { total, page, size, cases: rows.map((r) => ({ ...r, selectedWaitSeconds: r.sel_wait, sel_wait: undefined })) };
}

const TIMELINE_COLS = ["event_uid", "case_id", "case_uid", "activity", "activity_raw", "event_time_utc", "start_time_utc", "resource", "lifecycle", "case_attributes", "event_attributes",
  "object_refs", "snapshot_id", "source_row_number", "original_event_id", "mapping_version_id", "quality_flags", "excluded", "row_index"];

/** One case's events (including excluded ones, flagged) read from the dataset Parquet by row range. */
export async function caseTimeline(viewer: Viewer, projectId: string, datasetId: string, caseUid: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f]{16}$/.test(caseUid)) throw notFound();
  const ds = (await db().query<{ events_key: string; cases_key: string; snapshot_id: string; file_name: string; source_name: string; mapping_version: number; timezone: string }>(
    `SELECT d.events_key, d.cases_key, d.snapshot_id, sn.file_name, s.name AS source_name, m.version AS mapping_version, m.config->>'timezone' AS timezone
       FROM dataset_versions d JOIN source_snapshots sn ON sn.id = d.snapshot_id JOIN sources s ON s.id = d.source_id JOIN mapping_versions m ON m.id = d.mapping_version_id
      WHERE d.id = $1 AND d.project_id = $2`, [datasetId, projectId],
  )).rows[0];
  if (!ds) throw notFound();
  let range = (await db().query<{ row_start: number; row_end: number }>(
    `SELECT c.row_start, c.row_end FROM analysis_cases c JOIN analysis_runs r ON r.id = c.run_id WHERE r.dataset_version_id = $1 AND c.case_uid = $2 LIMIT 1`, [datasetId, caseUid],
  )).rows[0];
  if (!range) {
    // No analysis has indexed this case yet: fall back to the dataset's own case index.
    const cases = await readRows(projectId, ds.cases_key, { rowStart: 0, rowEnd: Number.MAX_SAFE_INTEGER, columns: ["case_uid", "row_start", "row_end"] });
    const hit = cases.find((c) => c.case_uid === caseUid);
    if (!hit) throw notFound();
    range = { row_start: Number(hit.row_start), row_end: Number(hit.row_end) };
  }
  const events = (await readRows(projectId, ds.events_key, { rowStart: Number(range.row_start), rowEnd: Number(range.row_end) + 1, columns: TIMELINE_COLS }))
    .map(plain).filter((e) => e.case_uid === caseUid);
  if (!events.length) throw notFound();
  return {
    caseUid, caseId: events[0]!.case_id, datasetVersionId: datasetId,
    source: { name: ds.source_name, snapshotId: ds.snapshot_id, fileName: ds.file_name, mappingVersion: ds.mapping_version, sourceTimezone: ds.timezone },
    events: events.map((e) => ({ ...e, case_attributes: safeJson(e.case_attributes), event_attributes: safeJson(e.event_attributes) })),
  };
}

const safeJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return {}; } };
