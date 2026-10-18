import { ApplicationFailure } from "@temporalio/activity";
import { AuthzError, assertProjectKey } from "@nora/authz";
import { day, dbJson, jsonAs } from "@nora/db";
import { BuildDatasetInput, BuildDatasetReport, IngestReport, IngestSnapshotInput, MappingConfig, MAX_UPLOAD_BYTES } from "@nora/contracts";
import { getJson, head, sha256 } from "@nora/storage";
import { audit, authorizeUser, db, withTx } from "../db.ts";

export interface JobRef {
  projectId: string;
  requestedBy: string;
  correlationId: string;
}

/** Re-checks membership and project status inside the worker: a revoked or suspended project stops new work. */
async function authorizeJob(job: JobRef, action: "data.write") {
  try {
    await authorizeUser(job.requestedBy, action, job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
}

async function failSnapshot(snapshotId: string, projectId: string, code: string, message: string) {
  await db().sourceSnapshot.updateMany({
    where: { id: snapshotId, projectId, status: { in: ["awaiting_upload", "validating"] } },
    data: { status: "failed", errorCode: code, errorMessage: message, updatedAt: new Date() },
  });
}

export type VerifyResult = { kind: "ingest"; input: IngestSnapshotInput } | { kind: "reused" } | { kind: "rejected" };

export async function verifySnapshot(job: JobRef & { snapshotId: string }): Promise<VerifyResult> {
  try {
    await authorizeJob(job, "data.write");
  } catch (err) {
    await failSnapshot(job.snapshotId, job.projectId, "unauthorized", "Proyek tidak aktif atau akses pengunggah dicabut.");
    return { kind: "rejected" };
  }
  const snap = await db().sourceSnapshot.findFirst({ where: { id: job.snapshotId, projectId: job.projectId }, select: { sourceId: true, rawKey: true, fileName: true, status: true } });
  if (!snap) throw ApplicationFailure.nonRetryable("snapshot not found in project", "NotFound");
  if (snap.status !== "validating") return { kind: "rejected" };
  assertProjectKey(job.projectId, snap.rawKey);

  const meta = await head(job.projectId, snap.rawKey);
  if (!meta) {
    await failSnapshot(job.snapshotId, job.projectId, "missing_upload", "File belum diunggah ke object storage.");
    return { kind: "rejected" };
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    await failSnapshot(job.snapshotId, job.projectId, "too_large", "File melebihi batas 2 GiB.");
    return { kind: "rejected" };
  }
  const sum = await sha256(job.projectId, snap.rawKey);
  await db().sourceSnapshot.updateMany({ where: { id: job.snapshotId, projectId: job.projectId }, data: { sha256: sum.sha256, sizeBytes: BigInt(sum.size), updatedAt: new Date() } });

  // Same bytes on the same source: reuse the earlier staging result instead of parsing again.
  const reused = await withTx(async (tx) => {
    const prev = await tx.sourceSnapshot.findFirst({
      where: { sourceId: snap.sourceId, projectId: job.projectId, sha256: sum.sha256, id: { not: job.snapshotId }, status: { in: ["ready_for_mapping", "needs_review"] }, stagingKey: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    if (!prev) return false;
    await tx.sourceSnapshot.update({
      where: { id: job.snapshotId },
      data: {
        status: prev.status, stagingKey: prev.stagingKey, reportKey: prev.reportKey, format: prev.format, encoding: prev.encoding, delimiter: prev.delimiter,
        rowCount: prev.rowCount, invalidRowCount: prev.invalidRowCount, columns: dbJson(prev.columns), preview: dbJson(prev.preview),
        suggestedMapping: dbJson(prev.suggestedMapping), reviewReasons: dbJson(prev.reviewReasons), reusedFrom: prev.id, updatedAt: new Date(),
      },
    });
    await audit(tx, { projectId: job.projectId, actorId: job.requestedBy, action: "snapshot.reuse", objectType: "snapshot", objectId: job.snapshotId, correlationId: job.correlationId, metadata: { reusedFrom: prev.id, sha256: sum.sha256 } });
    return true;
  });
  if (reused) return { kind: "reused" };

  const base = `projects/${job.projectId}/staging/${job.snapshotId}`;
  return {
    kind: "ingest",
    input: IngestSnapshotInput.parse({
      projectId: job.projectId, snapshotId: job.snapshotId, rawKey: snap.rawKey,
      stagingKey: `${base}/parsed.parquet`, reportKey: `${base}/ingest.json`, fileName: snap.fileName, maxBytes: MAX_UPLOAD_BYTES,
    }),
  };
}

/** Whether the project's status changed after an upload/run started (shown as a warning on the result). */
const statusChangedSince = async (projectId: string, since: Date | null) => {
  const p = await db().project.findUniqueOrThrow({ where: { id: projectId }, select: { statusChangedAt: true } });
  return !!since && p.statusChangedAt > since;
};

export async function saveIngestReport(job: JobRef & { snapshotId: string; stagingKey: string; reportKey: string }): Promise<string> {
  const report = IngestReport.parse(await getJson(job.projectId, job.reportKey));
  const snap = await db().sourceSnapshot.findFirst({ where: { id: job.snapshotId, projectId: job.projectId }, select: { uploadCompletedAt: true } });
  const projectStatusChanged = snap ? await statusChangedSince(job.projectId, snap.uploadCompletedAt) : false;
  await withTx(async (tx) => {
    await tx.sourceSnapshot.updateMany({
      where: { id: job.snapshotId, projectId: job.projectId },
      data: {
        status: report.status, stagingKey: report.status === "failed" ? null : job.stagingKey, reportKey: job.reportKey, format: report.format, encoding: report.encoding,
        delimiter: report.delimiter, rowCount: report.rowCount == null ? null : BigInt(report.rowCount), invalidRowCount: report.invalidRowCount == null ? null : BigInt(report.invalidRowCount),
        columns: dbJson(report.columns), preview: dbJson(report.preview), suggestedMapping: dbJson(report.suggestedMapping), reviewReasons: dbJson(report.reviewReasons),
        errorCode: report.errorCode, errorMessage: report.errorMessage, projectStatusChanged, updatedAt: new Date(),
      },
    });
    await tx.ingestErrorSample.deleteMany({ where: { snapshotId: job.snapshotId } });
    await tx.ingestErrorSample.createMany({
      data: report.errorSamples.map((s) => ({ projectId: job.projectId, snapshotId: job.snapshotId, rowNumber: s.row == null ? null : BigInt(s.row), message: s.message })),
    });
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
    await db().datasetVersion.updateMany({
      where: { id: job.datasetVersionId, projectId: job.projectId, status: { in: ["draft", "processing"] } }, data: { status: "failed", errorMessage: "Proyek tidak aktif atau akses dicabut" },
    });
    return null;
  }
  const row = await db().datasetVersion.findFirst({
    where: { id: job.datasetVersionId, projectId: job.projectId },
    select: {
      id: true, sourceId: true, snapshotId: true, mappingVersionId: true, eventsKey: true, casesKey: true, reportKey: true, status: true,
      snapshot: { select: { stagingKey: true, status: true } }, mappingVersion: { select: { config: true } }, project: { select: { contractStart: true, contractEnd: true } },
    },
  });
  if (!row) throw ApplicationFailure.nonRetryable("dataset not found in project", "NotFound");
  if (row.status !== "processing" && row.status !== "draft") return null;
  if (row.snapshot.status !== "ready_for_mapping" || !row.snapshot.stagingKey) throw ApplicationFailure.nonRetryable("snapshot is not ready for mapping", "SnapshotNotReady");
  await db().datasetVersion.updateMany({ where: { id: job.datasetVersionId, status: "draft" }, data: { status: "processing" } });
  return BuildDatasetInput.parse({
    projectId: job.projectId, datasetVersionId: row.id, sourceId: row.sourceId, snapshotId: row.snapshotId, mappingVersionId: row.mappingVersionId,
    stagingKey: row.snapshot.stagingKey, eventsKey: row.eventsKey, casesKey: row.casesKey, reportKey: row.reportKey, config: MappingConfig.parse(row.mappingVersion.config),
    projectPeriod: { start: day(row.project.contractStart), end: day(row.project.contractEnd) },
    processBoundary: await activeProcessBoundary(job.projectId),
  });
}

/** The active context package supplies the boundary; until one is active, incomplete-case checks stay off. */
async function activeProcessBoundary(projectId: string): Promise<{ startActivities: string[]; endActivities: string[] } | null> {
  const pkg = await db().contextPackage.findFirst({ where: { projectId, status: "active" }, orderBy: { activatedAt: "desc" }, select: { processBoundary: { select: { payload: true } } } });
  if (!pkg) return null;
  const b = jsonAs<{ startActivities: string[]; endActivities: string[] }>(pkg.processBoundary.payload);
  return { startActivities: b.startActivities, endActivities: b.endActivities };
}

export async function saveDatasetReport(job: JobRef & { datasetVersionId: string; reportKey: string }): Promise<string> {
  const report = BuildDatasetReport.parse(await getJson(job.projectId, job.reportKey));
  const date = (s: string | null) => (s ? new Date(s) : null);
  await withTx(async (tx) => {
    await tx.datasetVersion.updateMany({
      where: { id: job.datasetVersionId, projectId: job.projectId, status: "processing" },
      data: {
        status: "quality_review", qualityStatus: report.qualityStatus, eventCount: BigInt(report.eventCount), caseCount: BigInt(report.caseCount),
        excludedEventCount: BigInt(report.excludedEventCount), activityLabels: report.activityLabels, periodStart: date(report.periodStart), periodEnd: date(report.periodEnd),
        processedAt: new Date(), errorMessage: null,
      },
    });
    await tx.qualityFinding.deleteMany({ where: { datasetVersionId: job.datasetVersionId } });
    await tx.qualityFinding.createMany({
      data: report.findings.map((f) => ({
        projectId: job.projectId, datasetVersionId: job.datasetVersionId, checkKey: f.check, severity: f.severity, eventCount: BigInt(f.eventCount), caseCount: BigInt(f.caseCount),
        eventShare: f.eventShare, caseShare: f.caseShare, excludedEventCount: BigInt(f.excludedEventCount), samples: f.samples,
      })),
    });
    await tx.capabilityMatrix.upsert({
      where: { datasetVersionId: job.datasetVersionId },
      create: { datasetVersionId: job.datasetVersionId, projectId: job.projectId, capabilities: report.capabilities },
      update: { capabilities: report.capabilities },
    });
    await audit(tx, { projectId: job.projectId, actorId: job.requestedBy, action: "dataset.process", objectType: "dataset_version", objectId: job.datasetVersionId, correlationId: job.correlationId, metadata: { quality: report.qualityStatus, events: report.eventCount } });
  });
  return report.qualityStatus;
}

export async function markDatasetFailed(job: JobRef & { datasetVersionId: string; message: string }): Promise<void> {
  await db().datasetVersion.updateMany({
    where: { id: job.datasetVersionId, projectId: job.projectId, status: { in: ["draft", "processing"] } }, data: { status: "failed", errorMessage: job.message.slice(0, 500) },
  });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "dataset.process", objectType: "dataset_version", objectId: job.datasetVersionId, result: "failed", correlationId: job.correlationId, metadata: { message: job.message.slice(0, 500) } });
}
