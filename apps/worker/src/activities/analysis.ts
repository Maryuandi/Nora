import { gunzipSync } from "node:zlib";
import { authorize, AuthzError } from "@nora/authz";
import { withTx } from "@nora/db";
import { ProcessAnalysisInput, ProcessAnalysisManifest, ProcessMapResult } from "@nora/contracts";
import { getBytes, getJson } from "@nora/storage";
import type pg from "pg";
import { z } from "zod";
import { audit, db } from "../db.ts";
import type { JobRef } from "./data.ts";

export type RunJob = JobRef & { analysisRunId: string };

export async function loadAnalysisInput(job: RunJob): Promise<ProcessAnalysisInput | null> {
  try {
    await authorize(db(), job.requestedBy, "analysis.run", job.projectId);
  } catch (err) {
    if (!(err instanceof AuthzError)) throw err;
    await db().query("UPDATE analysis_runs SET status = 'failed', error_message = 'Proyek tidak aktif atau akses dicabut' WHERE id = $1 AND status = 'queued'", [job.analysisRunId]);
    return null;
  }
  const row = (await db().query(
    `UPDATE analysis_runs r SET status = 'running', started_at = now()
       FROM dataset_versions d, mapping_versions m, context_packages c
      WHERE r.id = $1 AND r.project_id = $2 AND r.status IN ('queued', 'running')
        AND d.id = r.dataset_version_id AND m.id = d.mapping_version_id AND c.id = r.context_package_id
      RETURNING r.filter_spec, r.artifact_prefix, d.events_key, m.config->'columns'->'caseAttributes' AS case_attrs,
        (SELECT json_build_object('startActivities', b.payload->'startActivities', 'endActivities', b.payload->'endActivities')
           FROM process_boundaries b WHERE b.id = c.process_boundary_id) AS boundary`,
    [job.analysisRunId, job.projectId],
  )).rows[0];
  if (!row) return null;
  return ProcessAnalysisInput.parse({
    projectId: job.projectId, analysisRunId: job.analysisRunId, eventsKey: row.events_key, artifactPrefix: row.artifact_prefix,
    filter: row.filter_spec, boundary: row.boundary, caseAttributeKeys: row.case_attrs ?? [],
  });
}

async function insertRows(tx: pg.PoolClient, table: string, columns: string[], types: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 5000) {
    const chunk = rows.slice(i, i + 5000);
    const arrays = columns.map((_, c) => chunk.map((r) => r[c]));
    await tx.query(
      `INSERT INTO ${table} (${columns.join(", ")}) SELECT * FROM unnest(${types.map((t, j) => `$${j + 1}::${t}[]`).join(", ")})`,
      arrays,
    );
  }
}

/** Persists aggregates and per-case drill-down rows; the run becomes result_ready so the map can show early. */
export async function saveProcessResult(job: RunJob & { manifest: unknown }): Promise<void> {
  const m = ProcessAnalysisManifest.parse(job.manifest);
  const map = ProcessMapResult.extend({ warnings: z.array(z.string()).default([]) }).parse(await getJson(job.projectId, m.mapKey));
  const lines = gunzipSync(Buffer.from(await getBytes(job.projectId, m.caseRowsKey))).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown[]);
  const run = job.analysisRunId;
  await withTx(db(), async (tx) => {
    for (const t of ["analysis_case_nodes", "analysis_case_edges", "analysis_cases", "variants", "process_edges", "process_nodes"]) await tx.query(`DELETE FROM ${t} WHERE run_id = $1`, [run]);
    const real = map.nodes.filter((n) => n.id !== "__start" && n.id !== "__end");
    await insertRows(tx, "process_nodes",
      ["run_id", "project_id", "activity", "event_count", "case_count", "case_share", "start_count", "end_count", "boundary_start", "boundary_end", "service_median_s"],
      ["uuid", "uuid", "text", "bigint", "bigint", "float8", "bigint", "bigint", "bool", "bool", "float8"],
      real.map((n) => [run, job.projectId, n.id, n.eventCount, n.caseCount, n.caseShare, n.startCount, n.endCount, n.boundaryStart, n.boundaryEnd, n.serviceMedianSeconds]));
    await insertRows(tx, "process_edges",
      ["run_id", "project_id", "from_activity", "to_activity", "occurrence_count", "case_count", "median_wait_s", "p90_wait_s", "total_wait_s", "contribution_share"],
      ["uuid", "uuid", "text", "text", "bigint", "bigint", "float8", "float8", "float8", "float8"],
      map.edges.map((e) => [run, job.projectId, e.from, e.to, e.count, e.caseCount, e.medianSeconds, e.p90Seconds, e.totalSeconds, e.contributionShare]));
    await insertRows(tx, "variants",
      ["run_id", "project_id", "rank", "sequence_hash", "sequence", "case_count", "share", "cumulative_share", "median_duration_s"],
      ["uuid", "uuid", "int", "text", "jsonb", "bigint", "float8", "float8", "float8"],
      map.variants.map((v, i) => [run, job.projectId, i + 1, v.hash, JSON.stringify(v.sequence), v.caseCount, v.share, v.cumulativeShare, v.medianDurationSeconds]));
    await insertRows(tx, "analysis_cases",
      ["run_id", "project_id", "case_uid", "case_id", "start_time", "end_time", "duration_s", "event_count", "first_activity", "last_activity", "variant_hash", "row_start", "row_end"],
      ["uuid", "uuid", "text", "text", "timestamptz", "timestamptz", "float8", "int", "text", "text", "text", "bigint", "bigint"],
      lines.filter((l) => l[0] === "c").map((l) => [run, job.projectId, ...l.slice(1)]));
    await insertRows(tx, "analysis_case_edges", ["run_id", "case_uid", "from_activity", "to_activity", "occurrences", "total_wait_s", "max_wait_s"],
      ["uuid", "text", "text", "text", "int", "float8", "float8"], lines.filter((l) => l[0] === "e").map((l) => [run, ...l.slice(1)]));
    await insertRows(tx, "analysis_case_nodes", ["run_id", "case_uid", "activity", "occurrences"], ["uuid", "text", "text", "int"],
      lines.filter((l) => l[0] === "n").map((l) => [run, ...l.slice(1)]));
    await tx.query(
      `UPDATE analysis_runs r SET status = 'result_ready', result_ready_at = now(), coverage = $2, warnings = $3,
              project_status_changed = coalesce((SELECT p.status_changed_at > r.created_at FROM projects p WHERE p.id = r.project_id), false)
        WHERE r.id = $1`,
      [run, JSON.stringify({ ...map.coverage, mapAvailable: map.mapAvailable, unavailableReason: map.unavailableReason, caseDuration: map.caseDuration }), JSON.stringify(map.warnings)],
    );
  });
}

export async function markAnalysisCompleted(job: RunJob): Promise<void> {
  await db().query("UPDATE analysis_runs SET status = 'completed', completed_at = now() WHERE id = $1 AND status IN ('running', 'result_ready')", [job.analysisRunId]);
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "analysis.complete", objectType: "analysis_run", objectId: job.analysisRunId, correlationId: job.correlationId });
}

export async function markAnalysisFailed(job: RunJob & { message: string }): Promise<void> {
  await db().query("UPDATE analysis_runs SET status = 'failed', error_message = $2 WHERE id = $1 AND status IN ('queued', 'running', 'result_ready')", [job.analysisRunId, job.message.slice(0, 500)]);
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "analysis.complete", objectType: "analysis_run", objectId: job.analysisRunId, result: "failed", correlationId: job.correlationId, metadata: { message: job.message.slice(0, 500) } });
}

