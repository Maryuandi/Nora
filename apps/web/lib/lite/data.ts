import "server-only";
import { createHash } from "node:crypto";
import { CANONICAL_ALGORITHM_VERSION, MappingConfig, MAX_UPLOAD_BYTES, stableStringify, type PreviewMappingResult } from "@nora/contracts";
import { presignPut } from "@nora/storage";
import type { z } from "zod";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./http";
import { runJob, startJob } from "./jobs";
import { can } from "./projects";

export { stableStringify };

export const contentHash = (rawSha256: string, config: MappingConfig) =>
  createHash("sha256").update(`${rawSha256}\n${stableStringify(config)}\n${CANONICAL_ALGORITHM_VERSION}`).digest("hex");

// ---------------------------------------------------------------- sources

export interface SourceRow {
  id: string;
  name: string;
  createdAt: string;
  snapshotCount: number;
  latestSnapshot: { id: string; status: string; fileName: string; createdAt: string } | null;
  latestDataset: { id: string; name: string; status: string; qualityStatus: string | null } | null;
}

export async function listSources(viewer: Viewer, projectId: string): Promise<SourceRow[]> {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<SourceRow>(
    `SELECT s.id, s.name, s.created_at AS "createdAt",
            (SELECT count(*) FROM source_snapshots x WHERE x.source_id = s.id) AS "snapshotCount",
            (SELECT json_build_object('id', x.id, 'status', x.status, 'fileName', x.file_name, 'createdAt', x.created_at)
               FROM source_snapshots x WHERE x.source_id = s.id ORDER BY x.created_at DESC LIMIT 1) AS "latestSnapshot",
            (SELECT json_build_object('id', d.id, 'name', d.name, 'status', d.status, 'qualityStatus', d.quality_status)
               FROM dataset_versions d WHERE d.source_id = s.id ORDER BY d.created_at DESC LIMIT 1) AS "latestDataset"
       FROM sources s WHERE s.project_id = $1 ORDER BY s.created_at`,
    [projectId],
  );
  return rows;
}

export async function getSource(viewer: Viewer, projectId: string, sourceId: string) {
  await can(viewer, "project.read", projectId);
  const row = (await db().query<{ id: string; name: string; createdAt: string }>(
    `SELECT id, name, created_at AS "createdAt" FROM sources WHERE id = $1 AND project_id = $2`, [sourceId, projectId],
  )).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function createSource(viewer: Viewer, projectId: string, name: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    const dup = await tx.query("SELECT 1 FROM sources WHERE project_id = $1 AND lower(name) = lower($2)", [projectId, name]);
    if (dup.rows.length) throw conflict("Nama sumber sudah dipakai", { name: "Nama sumber sudah dipakai" });
    const { rows } = await tx.query<{ id: string }>("INSERT INTO sources (project_id, name, created_by) VALUES ($1, $2, $3) RETURNING id", [projectId, name, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "source.create", objectType: "source", objectId: rows[0]!.id, correlationId, metadata: { name } });
    return { id: rows[0]!.id };
  });
}

// ---------------------------------------------------------------- snapshots

export async function createUpload(viewer: Viewer, projectId: string, sourceId: string, fileName: string, size: number, correlationId: string) {
  await can(viewer, "data.write", projectId);
  if (size > MAX_UPLOAD_BYTES) throw badRequest("File melebihi batas 2 GiB", { file: "File melebihi batas 2 GiB" });
  return withTx(async (tx) => {
    if (!(await tx.query("SELECT 1 FROM sources WHERE id = $1 AND project_id = $2", [sourceId, projectId])).rows.length) throw notFound();
    const id = crypto.randomUUID();
    const rawKey = `projects/${projectId}/raw/${id}/source`;
    await tx.query(
      "INSERT INTO source_snapshots (id, project_id, source_id, file_name, declared_size, raw_key, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, projectId, sourceId, fileName, size, rawKey, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "snapshot.create", objectType: "snapshot", objectId: id, correlationId, metadata: { fileName, size } });
    const upload = await presignPut(projectId, rawKey);
    return { snapshotId: id, upload: { method: "PUT", ...upload, expiresInSeconds: 900 } };
  });
}

export async function completeUpload(viewer: Viewer, projectId: string, snapshotId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  const updated = await withTx(async (tx) => {
    const cur = (await tx.query<{ status: string }>("SELECT status FROM source_snapshots WHERE id = $1 AND project_id = $2 FOR UPDATE", [snapshotId, projectId])).rows[0];
    if (!cur) throw notFound();
    if (cur.status !== "awaiting_upload" && cur.status !== "validating") throw conflict(`Snapshot sudah berstatus ${cur.status}`);
    if (cur.status === "validating") return false;
    await tx.query("UPDATE source_snapshots SET status = 'validating', upload_completed_at = now(), updated_at = now() WHERE id = $1", [snapshotId]);
    await audit(tx, { projectId, actorId: viewer.id, action: "snapshot.complete", objectType: "snapshot", objectId: snapshotId, correlationId });
    return true;
  });
  // Started after commit; a retry of "complete" on a validating snapshot re-attempts the start idempotently.
  await startJob("ingestSnapshotWorkflow", snapshotId, [{ projectId, snapshotId, requestedBy: viewer.id, correlationId }]);
  return { snapshotId, started: updated };
}

export interface SnapshotDetail {
  id: string;
  sourceId: string;
  status: string;
  fileName: string;
  declaredSize: number;
  sizeBytes: number | null;
  sha256: string | null;
  format: string | null;
  encoding: string | null;
  delimiter: string | null;
  rowCount: number | null;
  invalidRowCount: number | null;
  columns: string[] | null;
  preview: Record<string, string | null>[] | null;
  suggestedMapping: Record<string, string> | null;
  reviewReasons: string[] | null;
  errorCode: string | null;
  errorMessage: string | null;
  reusedFrom: string | null;
  projectStatusChanged: boolean;
  createdAt: string;
  errorSamples: { row: number | null; message: string }[];
}

export async function getSnapshot(viewer: Viewer, projectId: string, snapshotId: string): Promise<SnapshotDetail> {
  await can(viewer, "project.read", projectId);
  const row = (await db().query<SnapshotDetail>(
    `SELECT id, source_id AS "sourceId", status, file_name AS "fileName", declared_size AS "declaredSize", size_bytes AS "sizeBytes", sha256, format, encoding,
            delimiter, row_count AS "rowCount", invalid_row_count AS "invalidRowCount", columns, preview, suggested_mapping AS "suggestedMapping",
            review_reasons AS "reviewReasons", error_code AS "errorCode", error_message AS "errorMessage", reused_from AS "reusedFrom",
            project_status_changed AS "projectStatusChanged", created_at AS "createdAt",
            coalesce((SELECT json_agg(json_build_object('row', e.row_number, 'message', e.message) ORDER BY e.id) FROM ingest_error_samples e WHERE e.snapshot_id = s.id), '[]') AS "errorSamples"
       FROM source_snapshots s WHERE id = $1 AND project_id = $2`,
    [snapshotId, projectId],
  )).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function listSnapshots(viewer: Viewer, projectId: string, sourceId: string) {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<{ id: string; status: string; fileName: string; rowCount: number | null; createdAt: string; reusedFrom: string | null }>(
    `SELECT id, status, file_name AS "fileName", row_count AS "rowCount", created_at AS "createdAt", reused_from AS "reusedFrom"
       FROM source_snapshots WHERE source_id = $1 AND project_id = $2 ORDER BY created_at DESC`,
    [sourceId, projectId],
  );
  return rows;
}

/** needs_review → ready_for_mapping after a human looked at the preview; awaiting_upload/needs_review → cancelled. */
export async function reviewSnapshot(viewer: Viewer, projectId: string, snapshotId: string, action: "approve" | "cancel", correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    const cur = (await tx.query<{ status: string }>("SELECT status FROM source_snapshots WHERE id = $1 AND project_id = $2 FOR UPDATE", [snapshotId, projectId])).rows[0];
    if (!cur) throw notFound();
    const allowed = action === "approve" ? cur.status === "needs_review" : cur.status === "needs_review" || cur.status === "awaiting_upload";
    if (!allowed) throw conflict(`Snapshot berstatus ${cur.status} tidak dapat di-${action === "approve" ? "setujui" : "batalkan"}`);
    const next = action === "approve" ? "ready_for_mapping" : "cancelled";
    await tx.query("UPDATE source_snapshots SET status = $2, updated_at = now() WHERE id = $1", [snapshotId, next]);
    await audit(tx, { projectId, actorId: viewer.id, action: `snapshot.${action}`, objectType: "snapshot", objectId: snapshotId, correlationId });
    return { status: next };
  });
}

// ---------------------------------------------------------------- mappings

export interface MappingRow {
  id: string;
  sourceId: string;
  version: number;
  config: MappingConfig;
  note: string;
  createdAt: string;
}

export async function listMappings(viewer: Viewer, projectId: string, sourceId?: string): Promise<MappingRow[]> {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<MappingRow>(
    `SELECT id, source_id AS "sourceId", version, config, note, created_at AS "createdAt" FROM mapping_versions
      WHERE project_id = $1 AND ($2::uuid IS NULL OR source_id = $2) ORDER BY source_id, version DESC`,
    [projectId, sourceId ?? null],
  );
  return rows;
}

export async function createMapping(viewer: Viewer, projectId: string, sourceId: string, config: MappingConfig, note: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    if (!(await tx.query("SELECT 1 FROM sources WHERE id = $1 AND project_id = $2 FOR UPDATE", [sourceId, projectId])).rows.length) throw notFound();
    const last = (await tx.query<{ v: number | null; config: MappingConfig | null }>(
      "SELECT max(version) AS v, (SELECT config FROM mapping_versions WHERE source_id = $1 ORDER BY version DESC LIMIT 1) AS config FROM mapping_versions WHERE source_id = $1", [sourceId],
    )).rows[0]!;
    // Saving an unchanged config returns the latest version instead of minting a duplicate.
    if (last.config && stableStringify(last.config) === stableStringify(config)) {
      const id = (await tx.query<{ id: string }>("SELECT id FROM mapping_versions WHERE source_id = $1 AND version = $2", [sourceId, last.v])).rows[0]!.id;
      return { id, version: last.v!, created: false };
    }
    const version = (last.v ?? 0) + 1;
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO mapping_versions (project_id, source_id, version, config, note, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [projectId, sourceId, version, JSON.stringify(config), note, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "mapping.create", objectType: "mapping_version", objectId: rows[0]!.id, correlationId, metadata: { sourceId, version, labelRules: Object.keys(config.labelMap).length, repairRules: config.repairRules.length } });
    return { id: rows[0]!.id, version, created: true };
  });
}

async function readySnapshot(projectId: string, snapshotId: string) {
  const snap = (await db().query<{ source_id: string; status: string; staging_key: string | null; sha256: string | null }>(
    "SELECT source_id, status, staging_key, sha256 FROM source_snapshots WHERE id = $1 AND project_id = $2", [snapshotId, projectId],
  )).rows[0];
  if (!snap) throw notFound();
  if (snap.status !== "ready_for_mapping" || !snap.staging_key || !snap.sha256) throw conflict("Snapshot belum siap dipetakan");
  return snap as { source_id: string; status: string; staging_key: string; sha256: string };
}

export async function previewMapping(viewer: Viewer, projectId: string, mappingId: string, snapshotId: string, draft?: MappingConfig): Promise<PreviewMappingResult> {
  await can(viewer, "project.read", projectId);
  const snap = await readySnapshot(projectId, snapshotId);
  let config = draft;
  if (!config) {
    const m = (await db().query<{ config: MappingConfig; source_id: string }>("SELECT config, source_id FROM mapping_versions WHERE id = $1 AND project_id = $2", [mappingId, projectId])).rows[0];
    if (!m) throw notFound();
    config = m.config;
  }
  return runJob<PreviewMappingResult>("previewMappingWorkflow", `preview-${crypto.randomUUID()}`, [{ projectId, stagingKey: snap.staging_key, config: MappingConfig.parse(config), limit: 50 }]);
}

// ---------------------------------------------------------------- datasets

export async function prepareDataset(viewer: Viewer, projectId: string, snapshotId: string, mappingVersionId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  const snap = await readySnapshot(projectId, snapshotId);
  const result = await withTx(async (tx) => {
    const m = (await tx.query<{ config: MappingConfig; source_id: string }>("SELECT config, source_id FROM mapping_versions WHERE id = $1 AND project_id = $2", [mappingVersionId, projectId])).rows[0];
    if (!m) throw notFound();
    if (m.source_id !== snap.source_id) throw badRequest("Mapping dan snapshot berasal dari sumber berbeda");
    const hash = contentHash(snap.sha256, MappingConfig.parse(m.config));
    await tx.query("SELECT 1 FROM sources WHERE id = $1 FOR UPDATE", [snap.source_id]);
    const existing = (await tx.query<{ id: string; status: string }>(
      "SELECT id, status FROM dataset_versions WHERE source_id = $1 AND content_hash = $2 AND status <> 'failed' ORDER BY created_at DESC LIMIT 1", [snap.source_id, hash],
    )).rows[0];
    if (existing) return { id: existing.id, reused: true, status: existing.status };
    const version = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM dataset_versions WHERE source_id = $1", [snap.source_id])).rows[0]!.v ?? 0) + 1;
    const name = ((await tx.query<{ name: string }>("SELECT name FROM sources WHERE id = $1", [snap.source_id])).rows[0]!.name) + ` v${version}`;
    const id = crypto.randomUUID();
    const base = `projects/${projectId}/datasets/${id}`;
    await tx.query(
      `INSERT INTO dataset_versions (id, project_id, source_id, snapshot_id, mapping_version_id, name, version, status, content_hash, algorithm_version, events_key, cases_key, report_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', $8, $9, $10, $11, $12, $13)`,
      [id, projectId, snap.source_id, snapshotId, mappingVersionId, name, version, hash, CANONICAL_ALGORITHM_VERSION, `${base}/events.parquet`, `${base}/cases.parquet`, `${base}/quality.json`, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "dataset.prepare", objectType: "dataset_version", objectId: id, correlationId, metadata: { snapshotId, mappingVersionId, contentHash: hash } });
    return { id, reused: false, status: "processing" };
  });
  if (!result.reused) await startJob("prepareDatasetWorkflow", `dataset-${result.id}`, [{ projectId, datasetVersionId: result.id, requestedBy: viewer.id, correlationId }]);
  return result;
}

export interface DatasetDetail {
  id: string;
  sourceId: string;
  sourceName: string;
  snapshotId: string;
  snapshotFileName: string;
  mappingVersionId: string;
  mappingVersion: number;
  name: string;
  version: number;
  status: string;
  qualityStatus: "ready" | "ready_with_notes" | "not_ready" | null;
  contentHash: string;
  algorithmVersion: string;
  eventCount: number | null;
  caseCount: number | null;
  excludedEventCount: number | null;
  activityLabels: { label: string; count: number }[] | null;
  periodStart: string | null;
  periodEnd: string | null;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  publishedAt: string | null;
  capabilities: Record<string, { available: boolean; level: string; reason: string }> | null;
  findings: { check: string; severity: "high" | "medium" | "info"; eventCount: number; caseCount: number; eventShare: number; caseShare: number; excludedEventCount: number; samples: { row: number | null; eventId: string | null; caseId: string | null; activity: string | null; detail: string | null }[] }[];
}

export async function getDataset(viewer: Viewer, projectId: string, datasetId: string): Promise<DatasetDetail> {
  await can(viewer, "project.read", projectId);
  const row = (await db().query<DatasetDetail>(
    `SELECT d.id, d.source_id AS "sourceId", s.name AS "sourceName", d.snapshot_id AS "snapshotId", sn.file_name AS "snapshotFileName",
            d.mapping_version_id AS "mappingVersionId", m.version AS "mappingVersion", d.name, d.version, d.status, d.quality_status AS "qualityStatus",
            d.content_hash AS "contentHash", d.algorithm_version AS "algorithmVersion", d.event_count AS "eventCount", d.case_count AS "caseCount",
            d.excluded_event_count AS "excludedEventCount", d.activity_labels AS "activityLabels", d.period_start AS "periodStart", d.period_end AS "periodEnd",
            d.error_message AS "errorMessage", d.created_at AS "createdAt", d.processed_at AS "processedAt", d.published_at AS "publishedAt",
            c.capabilities,
            coalesce((SELECT json_agg(json_build_object('check', f.check_key, 'severity', f.severity, 'eventCount', f.event_count, 'caseCount', f.case_count,
                       'eventShare', f.event_share, 'caseShare', f.case_share, 'excludedEventCount', f.excluded_event_count, 'samples', f.samples)
                       ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.event_count DESC)
                      FROM quality_findings f WHERE f.dataset_version_id = d.id), '[]') AS findings
       FROM dataset_versions d JOIN sources s ON s.id = d.source_id JOIN source_snapshots sn ON sn.id = d.snapshot_id
       JOIN mapping_versions m ON m.id = d.mapping_version_id LEFT JOIN capability_matrix c ON c.dataset_version_id = d.id
      WHERE d.id = $1 AND d.project_id = $2`,
    [datasetId, projectId],
  )).rows[0];
  if (!row) throw notFound();
  return row;
}

export async function listDatasets(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query<{ id: string; name: string; sourceId: string; status: string; qualityStatus: string | null; eventCount: number | null; caseCount: number | null; createdAt: string; publishedAt: string | null }>(
    `SELECT id, name, source_id AS "sourceId", status, quality_status AS "qualityStatus", event_count AS "eventCount", case_count AS "caseCount",
            created_at AS "createdAt", published_at AS "publishedAt"
       FROM dataset_versions WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows;
}

/** Only quality-reviewed, publishable datasets go out; the previous published version becomes superseded. */
export async function publishDataset(viewer: Viewer, projectId: string, datasetId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    const d = (await tx.query<{ status: string; quality_status: string | null }>("SELECT status, quality_status FROM dataset_versions WHERE id = $1 AND project_id = $2 FOR UPDATE", [datasetId, projectId])).rows[0];
    if (!d) throw notFound();
    if (d.status === "published") return { status: "published" };
    if (d.status !== "quality_review") throw conflict(`Dataset berstatus ${d.status} tidak dapat diterbitkan`);
    if (d.quality_status !== "ready" && d.quality_status !== "ready_with_notes") {
      throw new HttpError(409, "quality_not_ready", "Dataset belum siap: selesaikan temuan kualitas berat dengan aturan perbaikan, lalu proses ulang");
    }
    const prev = await tx.query<{ id: string }>("UPDATE dataset_versions SET status = 'superseded' WHERE project_id = $1 AND status = 'published' RETURNING id", [projectId]);
    await tx.query("UPDATE dataset_versions SET status = 'published', published_at = now(), published_by = $2 WHERE id = $1", [datasetId, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "dataset.publish", objectType: "dataset_version", objectId: datasetId, correlationId, metadata: { superseded: prev.rows.map((r) => r.id) } });
    return { status: "published" };
  });
}

export const QUALITY_CHECK_LABEL: Record<string, string> = {
  required_missing: "Field wajib kosong",
  timestamp_invalid: "Waktu tidak valid/tidak wajar",
  start_after_completion: "Waktu mulai setelah waktu selesai",
  duplicate: "Duplikat/ambigu",
  equal_timestamp: "Urutan ambigu (waktu sama)",
  unmapped_activity: "Aktivitas belum dipetakan",
  incomplete_case: "Kasus tidak lengkap",
  outside_project_period: "Di luar periode proyek",
};

export type MappingInput = z.input<typeof MappingConfig>;
