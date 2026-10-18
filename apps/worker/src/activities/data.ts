import { ApplicationFailure } from "@temporalio/activity";
import { authorize, AuthzError, assertProjectKey } from "@nora/authz";
import { withTx } from "@nora/db";
import { BuildDatasetInput, BuildDatasetReport, IngestReport, IngestSnapshotInput, MappingConfig, MAX_UPLOAD_BYTES } from "@nora/contracts";
import { getJson, head, sha256 } from "@nora/storage";
import { audit, db } from "../db.ts";

export interface JobRef {
  projectId: string;
  requestedBy: string;
  correlationId: string;
}

/** Re-checks membership and project status inside the worker: a revoked or suspended project stops new work. */
async function authorizeJob(job: JobRef, action: "data.write") {
  try {
    await authorize(db(), job.requestedBy, action, job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
}

async function failSnapshot(snapshotId: string, projectId: string, code: string, message: string) {
  await db().query(
    "UPDATE source_snapshots SET status = 'failed', error_code = $3, error_message = $4, updated_at = now() WHERE id = $1 AND project_id = $2 AND status IN ('awaiting_upload', 'validating')",
    [snapshotId, projectId, code, message],
  );
}

export type VerifyResult = { kind: "ingest"; input: IngestSnapshotInput } | { kind: "reused" } | { kind: "rejected" };

export async function verifySnapshot(job: JobRef & { snapshotId: string }): Promise<VerifyResult> {
  try {
    await authorizeJob(job, "data.write");
  } catch (err) {
    await failSnapshot(job.snapshotId, job.projectId, "unauthorized", "Proyek tidak aktif atau akses pengunggah dicabut.");
    return { kind: "rejected" };
  }
  const snap = (await db().query<{ source_id: string; raw_key: string; file_name: string; status: string }>(
    "SELECT source_id, raw_key, file_name, status FROM source_snapshots WHERE id = $1 AND project_id = $2", [job.snapshotId, job.projectId],
  )).rows[0];
  if (!snap) throw ApplicationFailure.nonRetryable("snapshot not found in project", "NotFound");
  if (snap.status !== "validating") return { kind: "rejected" };
  assertProjectKey(job.projectId, snap.raw_key);

  const meta = await head(job.projectId, snap.raw_key);
  if (!meta) {
    await failSnapshot(job.snapshotId, job.projectId, "missing_upload", "File belum diunggah ke object storage.");
    return { kind: "rejected" };
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    await failSnapshot(job.snapshotId, job.projectId, "too_large", "File melebihi batas 2 GiB.");
    return { kind: "rejected" };
  }
  const sum = await sha256(job.projectId, snap.raw_key);
  await db().query("UPDATE source_snapshots SET sha256 = $3, size_bytes = $4, updated_at = now() WHERE id = $1 AND project_id = $2", [job.snapshotId, job.projectId, sum.sha256, sum.size]);

  // Same bytes on the same source: reuse the earlier staging result instead of parsing again.
  const reused = await withTx(db(), async (tx) => {
    const prev = (await tx.query(
      `SELECT id FROM source_snapshots WHERE source_id = $1 AND project_id = $2 AND sha256 = $3 AND id <> $4
          AND status IN ('ready_for_mapping', 'needs_review') AND staging_key IS NOT NULL ORDER BY created_at LIMIT 1`,
      [snap.source_id, job.projectId, sum.sha256, job.snapshotId],
    )).rows[0] as { id: string } | undefined;
    if (!prev) return false;
    await tx.query(
      `UPDATE source_snapshots s SET status = p.status, staging_key = p.staging_key, report_key = p.report_key, format = p.format, encoding = p.encoding,
              delimiter = p.delimiter, row_count = p.row_count, invalid_row_count = p.invalid_row_count, columns = p.columns, preview = p.preview,
              suggested_mapping = p.suggested_mapping, review_reasons = p.review_reasons, reused_from = p.id, updated_at = now()
         FROM source_snapshots p WHERE s.id = $1 AND p.id = $2`,
      [job.snapshotId, prev.id],
    );
    await audit(tx, { projectId: job.projectId, actorId: job.requestedBy, action: "snapshot.reuse", objectType: "snapshot", objectId: job.snapshotId, correlationId: job.correlationId, metadata: { reusedFrom: prev.id, sha256: sum.sha256 } });
    return true;
  });
  if (reused) return { kind: "reused" };

  const base = `projects/${job.projectId}/staging/${job.snapshotId}`;
  return {
    kind: "ingest",
    input: IngestSnapshotInput.parse({
      projectId: job.projectId, snapshotId: job.snapshotId, rawKey: snap.raw_key,
      stagingKey: `${base}/parsed.parquet`, reportKey: `${base}/ingest.json`, fileName: snap.file_name, maxBytes: MAX_UPLOAD_BYTES,
    }),
  };
}

export async function saveIngestReport(job: JobRef & { snapshotId: string; stagingKey: string; reportKey: string }): Promise<string> {
  const report = IngestReport.parse(await getJson(job.projectId, job.reportKey));
  await withTx(db(), async (tx) => {
    await tx.query(
      `UPDATE source_snapshots s SET status = $3, staging_key = $4, report_key = $5, format = $6, encoding = $7, delimiter = $8, row_count = $9,
              invalid_row_count = $10, columns = $11, preview = $12, suggested_mapping = $13, review_reasons = $14, error_code = $15, error_message = $16,
              project_status_changed = coalesce((SELECT p.status_changed_at > s.upload_completed_at FROM projects p WHERE p.id = s.project_id), false),
              updated_at = now()
        WHERE s.id = $1 AND s.project_id = $2`,
      [job.snapshotId, job.projectId, report.status, report.status === "failed" ? null : job.stagingKey, job.reportKey, report.format, report.encoding, report.delimiter,
        report.rowCount, report.invalidRowCount, JSON.stringify(report.columns), JSON.stringify(report.preview), JSON.stringify(report.suggestedMapping),
        JSON.stringify(report.reviewReasons), report.errorCode, report.errorMessage],
    );
    await tx.query("DELETE FROM ingest_error_samples WHERE snapshot_id = $1", [job.snapshotId]);
    for (const s of report.errorSamples) {
      await tx.query("INSERT INTO ingest_error_samples (project_id, snapshot_id, row_number, message) VALUES ($1, $2, $3, $4)", [job.projectId, job.snapshotId, s.row, s.message]);
    }
    await audit(tx, { projectId: job.projectId, actorId: job.requestedBy, action: "snapshot.ingest", objectType: "snapshot", objectId: job.snapshotId, result: report.status === "failed" ? "failed" : "success", correlationId: job.correlationId, metadata: { status: report.status, format: report.format, rows: report.rowCount } });
  });
  return report.status;
}

export async function markSnapshotFailed(job: JobRef & { snapshotId: string; message: string }): Promise<void> {
  await failSnapshot(job.snapshotId, job.projectId, "worker_error", job.message.slice(0, 500));
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "snapshot.ingest", objectType: "snapshot", objectId: job.snapshotId, result: "failed", correlationId: job.correlationId, metadata: { message: job.message.slice(0, 500) } });
}

// ---------------------------------------------------------------- dataset

export async function loadDatasetBuild(job: JobRef & { datasetVersionId: string }): Promise<BuildDatasetInput | null> {
  try {
    await authorizeJob(job, "data.write");
  } catch {
    await db().query("UPDATE dataset_versions SET status = 'failed', error_message = 'Proyek tidak aktif atau akses dicabut' WHERE id = $1 AND project_id = $2 AND status IN ('draft', 'processing')", [job.datasetVersionId, job.projectId]);
    return null;
  }
  const row = (await db().query(
    `SELECT d.id, d.source_id, d.snapshot_id, d.mapping_version_id, d.events_key, d.cases_key, d.report_key, d.status,
            s.staging_key, s.status AS snapshot_status, m.config, p.contract_start, p.contract_end
       FROM dataset_versions d JOIN source_snapshots s ON s.id = d.snapshot_id JOIN mapping_versions m ON m.id = d.mapping_version_id
       JOIN projects p ON p.id = d.project_id
      WHERE d.id = $1 AND d.project_id = $2`,
    [job.datasetVersionId, job.projectId],
  )).rows[0];
  if (!row) throw ApplicationFailure.nonRetryable("dataset not found in project", "NotFound");
  if (row.status !== "processing" && row.status !== "draft") return null;
  if (row.snapshot_status !== "ready_for_mapping" || !row.staging_key) throw ApplicationFailure.nonRetryable("snapshot is not ready for mapping", "SnapshotNotReady");
  await db().query("UPDATE dataset_versions SET status = 'processing' WHERE id = $1 AND status = 'draft'", [job.datasetVersionId]);
  return BuildDatasetInput.parse({
    projectId: job.projectId, datasetVersionId: row.id, sourceId: row.source_id, snapshotId: row.snapshot_id, mappingVersionId: row.mapping_version_id,
    stagingKey: row.staging_key, eventsKey: row.events_key, casesKey: row.cases_key, reportKey: row.report_key, config: MappingConfig.parse(row.config),
    projectPeriod: { start: row.contract_start, end: row.contract_end },
    processBoundary: await activeProcessBoundary(job.projectId),
  });
}

/** F03 supplies the boundary once a context package is active; until then incomplete-case checks stay off. */
async function activeProcessBoundary(projectId: string): Promise<{ startActivities: string[]; endActivities: string[] } | null> {
  const exists = (await db().query("SELECT to_regclass('context_packages') IS NOT NULL AS ok")).rows[0]?.ok;
  if (!exists) return null;
  const row = (await db().query(
    `SELECT b.start_activities, b.end_activities FROM context_packages c JOIN process_boundaries b ON b.id = c.process_boundary_id
      WHERE c.project_id = $1 AND c.status = 'active' ORDER BY c.activated_at DESC LIMIT 1`,
    [projectId],
  )).rows[0];
  return row ? { startActivities: row.start_activities, endActivities: row.end_activities } : null;
}

export async function saveDatasetReport(job: JobRef & { datasetVersionId: string; reportKey: string }): Promise<string> {
  const report = BuildDatasetReport.parse(await getJson(job.projectId, job.reportKey));
  await withTx(db(), async (tx) => {
    await tx.query(
      `UPDATE dataset_versions SET status = 'quality_review', quality_status = $3, event_count = $4, case_count = $5, excluded_event_count = $6,
              activity_labels = $7, period_start = $8, period_end = $9, processed_at = now(), error_message = NULL
        WHERE id = $1 AND project_id = $2 AND status = 'processing'`,
      [job.datasetVersionId, job.projectId, report.qualityStatus, report.eventCount, report.caseCount, report.excludedEventCount,
        JSON.stringify(report.activityLabels), report.periodStart, report.periodEnd],
    );
    await tx.query("DELETE FROM quality_findings WHERE dataset_version_id = $1", [job.datasetVersionId]);
    for (const f of report.findings) {
      await tx.query(
        `INSERT INTO quality_findings (project_id, dataset_version_id, check_key, severity, event_count, case_count, event_share, case_share, excluded_event_count, samples)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [job.projectId, job.datasetVersionId, f.check, f.severity, f.eventCount, f.caseCount, f.eventShare, f.caseShare, f.excludedEventCount, JSON.stringify(f.samples)],
      );
    }
    await tx.query(
      `INSERT INTO capability_matrix (dataset_version_id, project_id, capabilities) VALUES ($1, $2, $3)
       ON CONFLICT (dataset_version_id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
      [job.datasetVersionId, job.projectId, JSON.stringify(report.capabilities)],
    );
    await audit(tx, { projectId: job.projectId, actorId: job.requestedBy, action: "dataset.process", objectType: "dataset_version", objectId: job.datasetVersionId, correlationId: job.correlationId, metadata: { quality: report.qualityStatus, events: report.eventCount } });
  });
  return report.qualityStatus;
}

export async function markDatasetFailed(job: JobRef & { datasetVersionId: string; message: string }): Promise<void> {
  await db().query("UPDATE dataset_versions SET status = 'failed', error_message = $3 WHERE id = $1 AND project_id = $2 AND status IN ('draft', 'processing')", [job.datasetVersionId, job.projectId, job.message.slice(0, 500)]);
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "dataset.process", objectType: "dataset_version", objectId: job.datasetVersionId, result: "failed", correlationId: job.correlationId, metadata: { message: job.message.slice(0, 500) } });
}
