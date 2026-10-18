import { gunzipSync } from "node:zlib";
import { AuthzError } from "@nora/authz";
import { jsonAs } from "@nora/db";
import { ProcessAnalysisInput, ProcessAnalysisManifest, ProcessMapResult, type MappingConfig } from "@nora/contracts";
import { getBytes, getJson } from "@nora/storage";
import { z } from "zod";
import { audit, authorizeUser, db, withTx } from "../db.ts";
import type { JobRef } from "./data.ts";

export type RunJob = JobRef & { analysisRunId: string };

/** Rows per INSERT; keeps every statement well under PostgreSQL's bind-parameter limit. */
const CHUNK = 2000;
export async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

export async function loadAnalysisInput(job: RunJob): Promise<ProcessAnalysisInput | null> {
  try {
    await authorizeUser(job.requestedBy, "analysis.run", job.projectId);
  } catch (err) {
    if (!(err instanceof AuthzError)) throw err;
    await db().analysisRun.updateMany({ where: { id: job.analysisRunId, status: "queued" }, data: { status: "failed", errorMessage: "Proyek tidak aktif atau akses dicabut" } });
    return null;
  }
  // Claims the run: only a queued (or retried running) run moves on.
  const claimed = await db().analysisRun.updateMany({ where: { id: job.analysisRunId, projectId: job.projectId, status: { in: ["queued", "running"] } }, data: { status: "running", startedAt: new Date() } });
  if (!claimed.count) return null;
  const run = await db().analysisRun.findUniqueOrThrow({
    where: { id: job.analysisRunId },
    select: {
      filterSpec: true, artifactPrefix: true,
      datasetVersion: { select: { eventsKey: true, mappingVersion: { select: { config: true } } } },
      contextPackage: { select: { processBoundary: { select: { payload: true } } } },
    },
  });
  const boundary = jsonAs<{ startActivities?: string[]; endActivities?: string[] }>(run.contextPackage.processBoundary.payload);
  return ProcessAnalysisInput.parse({
    projectId: job.projectId, analysisRunId: job.analysisRunId, eventsKey: run.datasetVersion.eventsKey, artifactPrefix: run.artifactPrefix,
    filter: run.filterSpec, boundary: { startActivities: boundary.startActivities ?? null, endActivities: boundary.endActivities ?? null },
    caseAttributeKeys: jsonAs<Partial<MappingConfig>>(run.datasetVersion.mappingVersion.config).columns?.caseAttributes ?? [],
  });
}

const date = (s: unknown) => (typeof s === "string" ? new Date(s) : null);

/** Persists aggregates and per-case drill-down rows; the run becomes result_ready so the map can show early. */
export async function saveProcessResult(job: RunJob & { manifest: unknown }): Promise<void> {
  const m = ProcessAnalysisManifest.parse(job.manifest);
  const map = ProcessMapResult.extend({ warnings: z.array(z.string()).default([]) }).parse(await getJson(job.projectId, m.mapKey));
  // Case rows: ["c", uid, id, start, end, duration, events, first, last, variant, rowStart, rowEnd], ["e", uid, from, to, n, total, max], ["n", uid, activity, n].
  const lines = gunzipSync(Buffer.from(await getBytes(job.projectId, m.caseRowsKey))).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown[]);
  const of = (kind: string) => lines.filter((l) => l[0] === kind);
  const runId = job.analysisRunId;
  const projectId = job.projectId;
  const run = await db().analysisRun.findUniqueOrThrow({ where: { id: runId }, select: { createdAt: true, project: { select: { statusChangedAt: true } } } });
  await withTx(async (tx) => {
    // A retried activity starts clean.
    await tx.analysisCaseNode.deleteMany({ where: { runId } });
    await tx.analysisCaseEdge.deleteMany({ where: { runId } });
    await tx.analysisCase.deleteMany({ where: { runId } });
    await tx.variant.deleteMany({ where: { runId } });
    await tx.processEdge.deleteMany({ where: { runId } });
    await tx.processNode.deleteMany({ where: { runId } });
    await tx.processNode.createMany({
      data: map.nodes.filter((n) => n.id !== "__start" && n.id !== "__end").map((n) => ({
        runId, projectId, activity: n.id, eventCount: BigInt(n.eventCount), caseCount: BigInt(n.caseCount), caseShare: n.caseShare, startCount: BigInt(n.startCount),
        endCount: BigInt(n.endCount), boundaryStart: n.boundaryStart, boundaryEnd: n.boundaryEnd, serviceMedianS: n.serviceMedianSeconds,
      })),
    });
    await tx.processEdge.createMany({
      data: map.edges.map((e) => ({
        runId, projectId, fromActivity: e.from, toActivity: e.to, occurrenceCount: BigInt(e.count), caseCount: BigInt(e.caseCount), medianWaitS: e.medianSeconds,
        p90WaitS: e.p90Seconds, totalWaitS: e.totalSeconds, contributionShare: e.contributionShare,
      })),
    });
    await tx.variant.createMany({
      data: map.variants.map((v, i) => ({
        runId, projectId, rank: i + 1, sequenceHash: v.hash, sequence: v.sequence, caseCount: BigInt(v.caseCount), share: v.share, cumulativeShare: v.cumulativeShare,
        medianDurationS: v.medianDurationSeconds,
      })),
    });
    await inChunks(of("c"), (rows) => tx.analysisCase.createMany({
      data: rows.map(([, caseUid, caseId, start, end, duration, events, first, last, variant, rowStart, rowEnd]) => ({
        runId, projectId, caseUid: String(caseUid), caseId: String(caseId), startTime: date(start), endTime: date(end), durationS: duration == null ? null : Number(duration),
        eventCount: Number(events), firstActivity: first == null ? null : String(first), lastActivity: last == null ? null : String(last), variantHash: String(variant),
        rowStart: BigInt(Number(rowStart)), rowEnd: BigInt(Number(rowEnd)),
      })),
    }));
    await inChunks(of("e"), (rows) => tx.analysisCaseEdge.createMany({
      data: rows.map(([, caseUid, from, to, n, total, max]) => ({
        runId, caseUid: String(caseUid), fromActivity: String(from), toActivity: String(to), occurrences: Number(n), totalWaitS: Number(total), maxWaitS: Number(max),
      })),
    }));
    await inChunks(of("n"), (rows) => tx.analysisCaseNode.createMany({
      data: rows.map(([, caseUid, activity, n]) => ({ runId, caseUid: String(caseUid), activity: String(activity), occurrences: Number(n) })),
    }));
    await tx.analysisRun.update({
      where: { id: runId },
      data: {
        status: "result_ready", resultReadyAt: new Date(), warnings: map.warnings,
        coverage: { ...map.coverage, mapAvailable: map.mapAvailable, unavailableReason: map.unavailableReason, caseDuration: map.caseDuration },
        projectStatusChanged: run.project.statusChangedAt > run.createdAt,
      },
    });
  });
}

export async function markAnalysisCompleted(job: RunJob): Promise<void> {
  await db().analysisRun.updateMany({ where: { id: job.analysisRunId, status: { in: ["running", "result_ready"] } }, data: { status: "completed", completedAt: new Date() } });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "analysis.complete", objectType: "analysis_run", objectId: job.analysisRunId, correlationId: job.correlationId });
}

export async function markAnalysisFailed(job: RunJob & { message: string }): Promise<void> {
  await db().analysisRun.updateMany({ where: { id: job.analysisRunId, status: { in: ["queued", "running", "result_ready"] } }, data: { status: "failed", errorMessage: job.message.slice(0, 500) } });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "analysis.complete", objectType: "analysis_run", objectId: job.analysisRunId, result: "failed", correlationId: job.correlationId, metadata: { message: job.message.slice(0, 500) } });
}
