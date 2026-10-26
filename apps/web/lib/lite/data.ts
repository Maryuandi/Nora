import "server-only";
import { createHash } from "node:crypto";
import { CANONICAL_ALGORITHM_VERSION, MappingConfig, MAX_UPLOAD_BYTES, stableStringify, type PreviewMappingResult } from "@nora/contracts";
import { jsonAs, type Db } from "@nora/db";
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

const num = (v: bigint | null) => (v == null ? null : Number(v));
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Row lock on a snapshot: status transitions of one snapshot are serialised. */
const lockSnapshot = async (tx: Db, projectId: string, snapshotId: string) =>
  (await tx.$queryRaw<{ status: string }[]>`SELECT status FROM source_snapshots WHERE id = ${snapshotId}::uuid AND project_id = ${projectId}::uuid FOR UPDATE`)[0];

/** Row lock on a source: version numbers of its mappings and datasets are allocated one at a time. */
const lockSource = async (tx: Db, sourceId: string, projectId?: string) =>
  (await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM sources WHERE id = ${sourceId}::uuid AND (${projectId ?? null}::uuid IS NULL OR project_id = ${projectId ?? null}::uuid) FOR UPDATE`).length > 0;

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
  const rows = await db().source.findMany({
    where: { projectId }, orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, createdAt: true, _count: { select: { sourceSnapshots: true } },
      sourceSnapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, fileName: true, createdAt: true } },
      datasetVersions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, name: true, status: true, qualityStatus: true } },
    },
  });
  return rows.map((s) => {
    const snap = s.sourceSnapshots[0];
    return {
      id: s.id, name: s.name, createdAt: s.createdAt.toISOString(), snapshotCount: s._count.sourceSnapshots,
      latestSnapshot: snap ? { ...snap, createdAt: snap.createdAt.toISOString() } : null, latestDataset: s.datasetVersions[0] ?? null,
    };
  });
}

export async function getSource(viewer: Viewer, projectId: string, sourceId: string) {
  await can(viewer, "project.read", projectId);
  const row = await db().source.findFirst({ where: { id: sourceId, projectId }, select: { id: true, name: true, createdAt: true } });
  if (!row) throw notFound();
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function createSource(viewer: Viewer, projectId: string, name: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    if (await tx.source.findFirst({ where: { projectId, name: { equals: name, mode: "insensitive" } }, select: { id: true } })) {
      throw conflict("Nama sumber sudah dipakai", { name: "Nama sumber sudah dipakai" });
    }
    const { id } = await tx.source.create({ data: { projectId, name, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "source.create", objectType: "source", objectId: id, correlationId, metadata: { name } });
    return { id };
  });
}

// ---------------------------------------------------------------- snapshots

export async function createUpload(viewer: Viewer, projectId: string, sourceId: string, fileName: string, size: number, correlationId: string) {
  await can(viewer, "data.write", projectId);
  if (size > MAX_UPLOAD_BYTES) throw badRequest("File melebihi batas 2 GiB", { file: "File melebihi batas 2 GiB" });
  return withTx(async (tx) => {
    if (!(await tx.source.findFirst({ where: { id: sourceId, projectId }, select: { id: true } }))) throw notFound();
    const id = crypto.randomUUID();
    const rawKey = `projects/${projectId}/raw/${id}/source`;
    await tx.sourceSnapshot.create({ data: { id, projectId, sourceId, fileName, declaredSize: BigInt(size), rawKey, createdBy: viewer.id } });
    await audit(tx, { projectId, actorId: viewer.id, action: "snapshot.create", objectType: "snapshot", objectId: id, correlationId, metadata: { fileName, size } });
    const upload = await presignPut(projectId, rawKey);
    return { snapshotId: id, upload: { method: "PUT", ...upload, expiresInSeconds: 900 } };
  });
}

export async function completeUpload(viewer: Viewer, projectId: string, snapshotId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  const updated = await withTx(async (tx) => {
    const cur = await lockSnapshot(tx, projectId, snapshotId);
    if (!cur) throw notFound();
    if (cur.status !== "awaiting_upload" && cur.status !== "validating") throw conflict(`Snapshot sudah berstatus ${cur.status}`);
    if (cur.status === "validating") return false;
    await tx.sourceSnapshot.update({ where: { id: snapshotId }, data: { status: "validating", uploadCompletedAt: new Date(), updatedAt: new Date() } });
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
  const s = await db().sourceSnapshot.findFirst({
    where: { id: snapshotId, projectId },
    select: {
      id: true, sourceId: true, status: true, fileName: true, declaredSize: true, sizeBytes: true, sha256: true, format: true, encoding: true, delimiter: true,
      rowCount: true, invalidRowCount: true, columns: true, preview: true, suggestedMapping: true, reviewReasons: true, errorCode: true, errorMessage: true,
      reusedFrom: true, projectStatusChanged: true, createdAt: true,
      ingestErrorSamples: { orderBy: { id: "asc" }, select: { rowNumber: true, message: true } },
    },
  });
  if (!s) throw notFound();
  const { ingestErrorSamples, ...rest } = s;
  return {
    ...rest, declaredSize: Number(s.declaredSize), sizeBytes: num(s.sizeBytes), rowCount: num(s.rowCount), invalidRowCount: num(s.invalidRowCount),
    columns: jsonAs<string[] | null>(s.columns), preview: jsonAs<Record<string, string | null>[] | null>(s.preview),
    suggestedMapping: jsonAs<Record<string, string> | null>(s.suggestedMapping), reviewReasons: jsonAs<string[] | null>(s.reviewReasons),
    createdAt: s.createdAt.toISOString(), errorSamples: ingestErrorSamples.map((e) => ({ row: num(e.rowNumber), message: e.message })),
  };
}

export async function listSnapshots(viewer: Viewer, projectId: string, sourceId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().sourceSnapshot.findMany({
    where: { sourceId, projectId }, orderBy: { createdAt: "desc" },
    select: { id: true, status: true, fileName: true, rowCount: true, createdAt: true, reusedFrom: true },
  });
  return rows.map((r) => ({ ...r, rowCount: num(r.rowCount), createdAt: r.createdAt.toISOString() }));
}

/** needs_review → ready_for_mapping after a human looked at the preview; awaiting_upload/needs_review → cancelled. */
export async function reviewSnapshot(viewer: Viewer, projectId: string, snapshotId: string, action: "approve" | "cancel", correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    const cur = await lockSnapshot(tx, projectId, snapshotId);
    if (!cur) throw notFound();
    const allowed = action === "approve" ? cur.status === "needs_review" : cur.status === "needs_review" || cur.status === "awaiting_upload";
    if (!allowed) throw conflict(`Snapshot berstatus ${cur.status} tidak dapat di-${action === "approve" ? "setujui" : "batalkan"}`);
    const next = action === "approve" ? "ready_for_mapping" : "cancelled";
    await tx.sourceSnapshot.update({ where: { id: snapshotId }, data: { status: next, updatedAt: new Date() } });
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
  const rows = await db().mappingVersion.findMany({
    where: { projectId, sourceId }, orderBy: [{ sourceId: "asc" }, { version: "desc" }],
    select: { id: true, sourceId: true, version: true, config: true, note: true, createdAt: true },
  });
  return rows.map((m) => ({ ...m, config: jsonAs<MappingConfig>(m.config), createdAt: m.createdAt.toISOString() }));
}

export async function createMapping(viewer: Viewer, projectId: string, sourceId: string, config: MappingConfig, note: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    if (!(await lockSource(tx, sourceId, projectId))) throw notFound();
    const last = await tx.mappingVersion.findFirst({ where: { sourceId }, orderBy: { version: "desc" }, select: { id: true, version: true, config: true } });
    // Saving an unchanged config returns the latest version instead of minting a duplicate.
    if (last && stableStringify(last.config) === stableStringify(config)) return { id: last.id, version: last.version, created: false };
    const version = (last?.version ?? 0) + 1;
    const { id } = await tx.mappingVersion.create({ data: { projectId, sourceId, version, config, note, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "mapping.create", objectType: "mapping_version", objectId: id, correlationId, metadata: { sourceId, version, labelRules: Object.keys(config.labelMap).length, repairRules: config.repairRules.length } });
    return { id, version, created: true };
  });
}

async function readySnapshot(projectId: string, snapshotId: string) {
  const snap = await db().sourceSnapshot.findFirst({ where: { id: snapshotId, projectId }, select: { sourceId: true, status: true, stagingKey: true, sha256: true } });
  if (!snap) throw notFound();
  if (snap.status !== "ready_for_mapping" || !snap.stagingKey || !snap.sha256) throw conflict("Snapshot belum siap dipetakan");
  return { sourceId: snap.sourceId, stagingKey: snap.stagingKey, sha256: snap.sha256 };
}

export async function previewMapping(viewer: Viewer, projectId: string, mappingId: string, snapshotId: string, draft?: MappingConfig): Promise<PreviewMappingResult> {
  await can(viewer, "project.read", projectId);
  const snap = await readySnapshot(projectId, snapshotId);
  let config: unknown = draft;
  if (!config) {
    const m = await db().mappingVersion.findFirst({ where: { id: mappingId, projectId }, select: { config: true } });
    if (!m) throw notFound();
    config = m.config;
  }
  return runJob<PreviewMappingResult>("previewMappingWorkflow", `preview-${crypto.randomUUID()}`, [{ projectId, stagingKey: snap.stagingKey, config: MappingConfig.parse(config), limit: 50 }]);
}

// ---------------------------------------------------------------- datasets

export async function prepareDataset(viewer: Viewer, projectId: string, snapshotId: string, mappingVersionId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  const snap = await readySnapshot(projectId, snapshotId);
  const result = await withTx(async (tx) => {
    const m = await tx.mappingVersion.findFirst({ where: { id: mappingVersionId, projectId }, select: { config: true, sourceId: true } });
    if (!m) throw notFound();
    if (m.sourceId !== snap.sourceId) throw badRequest("Mapping dan snapshot berasal dari sumber berbeda");
    const hash = contentHash(snap.sha256, MappingConfig.parse(m.config));
    await lockSource(tx, snap.sourceId);
    const existing = await tx.datasetVersion.findFirst({
      where: { sourceId: snap.sourceId, contentHash: hash, status: { not: "failed" } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true },
    });
    if (existing) return { id: existing.id, reused: true, status: existing.status };
    const max = await tx.datasetVersion.aggregate({ where: { sourceId: snap.sourceId }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    const source = await tx.source.findUniqueOrThrow({ where: { id: snap.sourceId }, select: { name: true } });
    const id = crypto.randomUUID();
    const base = `projects/${projectId}/datasets/${id}`;
    await tx.datasetVersion.create({
      data: {
        id, projectId, sourceId: snap.sourceId, snapshotId, mappingVersionId, name: `${source.name} v${version}`, version, status: "processing", contentHash: hash,
        algorithmVersion: CANONICAL_ALGORITHM_VERSION, eventsKey: `${base}/events.parquet`, casesKey: `${base}/cases.parquet`, reportKey: `${base}/quality.json`, createdBy: viewer.id,
      },
    });
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

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1 };

export async function getDataset(viewer: Viewer, projectId: string, datasetId: string): Promise<DatasetDetail> {
  await can(viewer, "project.read", projectId);
  const d = await db().datasetVersion.findFirst({
    where: { id: datasetId, projectId },
    select: {
      id: true, sourceId: true, snapshotId: true, mappingVersionId: true, name: true, version: true, status: true, qualityStatus: true, contentHash: true,
      algorithmVersion: true, eventCount: true, caseCount: true, excludedEventCount: true, activityLabels: true, periodStart: true, periodEnd: true,
      errorMessage: true, createdAt: true, processedAt: true, publishedAt: true,
      source: { select: { name: true } }, snapshot: { select: { fileName: true } }, mappingVersion: { select: { version: true } },
      capabilityMatrix: { select: { capabilities: true } }, qualityFindings: true,
    },
  });
  if (!d) throw notFound();
  const { source, snapshot, mappingVersion, capabilityMatrix, qualityFindings, ...rest } = d;
  const findings = qualityFindings
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2) || Number(b.eventCount - a.eventCount))
    .map((f) => ({
      check: f.checkKey, severity: f.severity as DatasetDetail["findings"][number]["severity"], eventCount: Number(f.eventCount), caseCount: Number(f.caseCount),
      eventShare: f.eventShare, caseShare: f.caseShare, excludedEventCount: Number(f.excludedEventCount), samples: jsonAs<DatasetDetail["findings"][number]["samples"]>(f.samples),
    }));
  return {
    ...rest, sourceName: source.name, snapshotFileName: snapshot.fileName, mappingVersion: mappingVersion.version,
    qualityStatus: rest.qualityStatus as DatasetDetail["qualityStatus"], eventCount: num(rest.eventCount), caseCount: num(rest.caseCount),
    excludedEventCount: num(rest.excludedEventCount), activityLabels: jsonAs<DatasetDetail["activityLabels"]>(rest.activityLabels),
    periodStart: iso(rest.periodStart), periodEnd: iso(rest.periodEnd), createdAt: rest.createdAt.toISOString(), processedAt: iso(rest.processedAt),
    publishedAt: iso(rest.publishedAt), capabilities: capabilityMatrix ? jsonAs<DatasetDetail["capabilities"]>(capabilityMatrix.capabilities) : null, findings,
  };
}

export async function listDatasets(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().datasetVersion.findMany({
    where: { projectId }, orderBy: { createdAt: "desc" },
    select: { id: true, name: true, sourceId: true, status: true, qualityStatus: true, eventCount: true, caseCount: true, createdAt: true, publishedAt: true },
  });
  return rows.map((d) => ({ ...d, eventCount: num(d.eventCount), caseCount: num(d.caseCount), createdAt: d.createdAt.toISOString(), publishedAt: iso(d.publishedAt) }));
}

/** Only quality-reviewed, publishable datasets go out; the previous published version becomes superseded. */
export async function publishDataset(viewer: Viewer, projectId: string, datasetId: string, correlationId: string) {
  await can(viewer, "data.write", projectId);
  return withTx(async (tx) => {
    // Row lock: two publishes of the same dataset must not both supersede.
    const [d] = await tx.$queryRaw<{ status: string; quality_status: string | null }[]>`
      SELECT status, quality_status FROM dataset_versions WHERE id = ${datasetId}::uuid AND project_id = ${projectId}::uuid FOR UPDATE`;
    if (!d) throw notFound();
    if (d.status === "published") return { status: "published" };
    if (d.status !== "quality_review") throw conflict(`Dataset berstatus ${d.status} tidak dapat diterbitkan`);
    if (d.quality_status !== "ready" && d.quality_status !== "ready_with_notes") {
      throw new HttpError(409, "quality_not_ready", "Dataset belum siap: selesaikan temuan kualitas berat dengan aturan perbaikan, lalu proses ulang");
    }
    const prev = await tx.datasetVersion.updateManyAndReturn({ where: { projectId, status: "published" }, data: { status: "superseded" }, select: { id: true } });
    await tx.datasetVersion.update({ where: { id: datasetId }, data: { status: "published", publishedAt: new Date(), publishedBy: viewer.id } });
    await audit(tx, { projectId, actorId: viewer.id, action: "dataset.publish", objectType: "dataset_version", objectId: datasetId, correlationId, metadata: { superseded: prev.map((r) => r.id) } });
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
