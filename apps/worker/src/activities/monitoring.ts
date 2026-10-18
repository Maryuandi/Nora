import { gunzipSync } from "node:zlib";
import { jsonAs, type Prisma } from "@nora/db";
import { METRIC_DEFINITIONS, MonitoringConfig, MonitoringInput, ReworkDefinition, RulePayload } from "@nora/contracts";
import { getBytes, getJson } from "@nora/storage";
import { db, withTx } from "../db.ts";
import { inChunks, type RunJob } from "./analysis.ts";

/** Everything the monitoring stage needs comes from the run's own context package, never from "current" config. */
export async function loadMonitoringInput(job: RunJob): Promise<MonitoringInput | null> {
  const claimed = await db().analysisRun.updateMany({ where: { id: job.analysisRunId, projectId: job.projectId }, data: { monitoringStatus: "running" } });
  if (!claimed.count) return null;
  const r = await db().analysisRun.findUniqueOrThrow({
    where: { id: job.analysisRunId },
    select: {
      filterSpec: true, artifactPrefix: true, monitoringConfig: true, datasetVersion: { select: { eventsKey: true } },
      contextPackage: { select: { id: true, reworkDefinitionId: true, bpmnModelId: true, bpmnMappingId: true, processBoundary: { select: { payload: true } } } },
    },
  });
  const c = r.contextPackage;
  const rework = c.reworkDefinitionId ? ReworkDefinition.parse((await db().reworkDefinition.findUniqueOrThrow({ where: { id: c.reworkDefinitionId }, select: { payload: true } })).payload) : null;
  const ruleRefs = await db().contextPackageRef.findMany({ where: { packageId: c.id, refType: "rule" }, select: { refId: true } });
  const rules = (await db().rule.findMany({ where: { id: { in: ruleRefs.map((x) => x.refId) } }, orderBy: { itemKey: "asc" }, select: { id: true, itemKey: true, version: true, payload: true } }))
    .map((x) => ({ id: x.id, key: x.itemKey, version: x.version, payload: RulePayload.parse(x.payload) }));
  let bpmn: MonitoringInput["bpmn"] = null;
  let reason: string | null = null;
  if (!c.bpmnModelId) reason = "Paket konteks tidak memuat model BPMN.";
  else {
    const m = await db().bpmnModel.findUniqueOrThrow({ where: { id: c.bpmnModelId }, select: { objectKey: true, tasks: true, validationStatus: true, validationError: true } });
    const map = c.bpmnMappingId ? await db().bpmnMapping.findUnique({ where: { id: c.bpmnMappingId }, select: { id: true, version: true, mapping: true } }) : null;
    const mapping = map ? jsonAs<Record<string, string[]>>(map.mapping) : {};
    if (m.validationStatus !== "valid") reason = `Model BPMN hanya referensi visual: ${m.validationError ?? "konversi PM4Py gagal"}.`;
    else if (!map || !Object.keys(mapping).length) reason = "Pemetaan task BPMN ke aktivitas belum ada.";
    else bpmn = { objectKey: m.objectKey, modelId: c.bpmnModelId, mappingId: map.id, mappingVersion: map.version, tasks: jsonAs<{ id: string; name: string }[]>(m.tasks), mapping };
  }
  return MonitoringInput.parse({
    projectId: job.projectId, analysisRunId: job.analysisRunId, eventsKey: r.datasetVersion.eventsKey, artifactPrefix: r.artifactPrefix, filter: r.filterSpec,
    boundary: c.processBoundary.payload, rework, rules, bpmn, bpmnUnavailableReason: reason, config: MonitoringConfig.parse(r.monitoringConfig ?? {}),
  });
}

type Json = Prisma.InputJsonValue;

/** The monitoring stage's result file (Python), as stored under the run's artifact prefix. */
interface MonitoringResult {
  metrics: { key: string; version: number; value: number | null; unit: string; available: boolean; reason: string | null; smallSample: boolean; population: Json }[];
  trend: { bucket: string; started: number; completed: number | null; medianDurationSeconds: number | null }[];
  transitions: {
    from: string; to: string; rank: number; occurrences: number; caseCount: number; medianSeconds: number | null; p90Seconds: number | null; totalSeconds: number | null;
    contributionShare: number; affectedCaseShare: number; delayExcess: number; severity: number; isBottleneck: boolean;
  }[];
  rework: Json;
  rules: { ruleId: string; key: string; version: number; name: string; compliant: number; nonCompliant: number; notEvaluable: number; reasons: Json }[];
  conformance: { status: string; reason: string | null; modelId?: string | null; mappingId?: string | null; mappingVersion?: number | null; fitness: number | null; variants: Json; mismatches: Json };
  findings: {
    type: string; title: string; summary: string; metricKey: string; metricVersion: number; metrics: Json; population: Json; thresholds: Json; subject: Json;
    severityScore: number; severityLabel: string;
  }[];
}

export async function saveMonitoringResult(job: RunJob & { manifest: { resultKey: string; findingCasesKey: string } }): Promise<number> {
  const res = await getJson<MonitoringResult>(job.projectId, job.manifest.resultKey);
  // [findingIndex, caseUid, caseId, rank, supportMetric, supportValue]
  const caseRows = gunzipSync(Buffer.from(await getBytes(job.projectId, job.manifest.findingCasesKey))).toString("utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l) as [number, string, string, number, string, number | null]);
  const runId = job.analysisRunId;
  const projectId = job.projectId;
  return withTx(async (tx) => {
    await tx.metricDefinition.createMany({
      data: METRIC_DEFINITIONS.map((d) => ({
        key: d.key, version: d.version, name: d.name, description: d.description, formula: d.formula, population: d.population, unit: d.unit,
        implementationVersion: d.implementation, referenceTest: d.referenceTest,
      })),
      skipDuplicates: true,
    });
    // A retried activity starts clean; the trigger only forbids UPDATE, so findings of an unfinished save can be removed.
    await tx.findingCase.deleteMany({ where: { finding: { analysisRunId: runId } } });
    await tx.finding.deleteMany({ where: { analysisRunId: runId } });
    await tx.conformanceResult.deleteMany({ where: { runId } });
    await tx.ruleEvaluation.deleteMany({ where: { runId } });
    await tx.reworkResult.deleteMany({ where: { runId } });
    await tx.transitionMetric.deleteMany({ where: { runId } });
    await tx.analysisMetricSeries.deleteMany({ where: { runId } });
    await tx.analysisMetric.deleteMany({ where: { runId } });
    await tx.analysisMetric.createMany({
      data: res.metrics.map((m) => ({
        runId, projectId, metricKey: m.key, metricVersion: m.version, value: m.value, unit: m.unit, available: m.available, reason: m.reason, smallSample: m.smallSample, population: m.population,
      })),
    });
    await tx.analysisMetricSeries.createMany({
      data: res.trend.map((s) => ({ runId, bucket: new Date(s.bucket), started: s.started, completed: s.completed, medianDurationS: s.medianDurationSeconds })),
    });
    await tx.transitionMetric.createMany({
      data: res.transitions.map((t) => ({
        runId, projectId, fromActivity: t.from, toActivity: t.to, rank: t.rank, occurrences: BigInt(t.occurrences), caseCount: BigInt(t.caseCount), medianWaitS: t.medianSeconds,
        p90WaitS: t.p90Seconds, totalWaitS: t.totalSeconds, contributionShare: t.contributionShare, affectedCaseShare: t.affectedCaseShare, delayExcess: t.delayExcess,
        severity: t.severity, isBottleneck: t.isBottleneck,
      })),
    });
    await tx.reworkResult.create({ data: { runId, projectId, result: res.rework } });
    await tx.ruleEvaluation.createMany({
      data: res.rules.map((r) => ({
        runId, projectId, ruleId: r.ruleId, ruleKey: r.key, ruleVersion: r.version, name: r.name, compliant: r.compliant, nonCompliant: r.nonCompliant, notEvaluable: r.notEvaluable, reasons: r.reasons,
      })),
    });
    const c = res.conformance;
    await tx.conformanceResult.create({
      data: {
        runId, projectId, status: c.status, reason: c.reason, bpmnModelId: c.modelId ?? null, bpmnMappingId: c.mappingId ?? null, mappingVersion: c.mappingVersion ?? null,
        fitness: c.fitness, variants: c.variants, mismatches: c.mismatches,
      },
    });
    const ids = await tx.analysisRun.findUniqueOrThrow({ where: { id: runId }, select: { datasetVersionId: true, contextPackageId: true } });
    const findingIds: string[] = [];
    for (const f of res.findings) {
      const { id } = await tx.finding.create({
        data: {
          projectId, analysisRunId: runId, type: f.type, title: f.title, summary: f.summary, metricKey: f.metricKey, metricVersion: f.metricVersion, metrics: f.metrics,
          population: f.population, thresholds: f.thresholds, subject: f.subject, severityScore: f.severityScore, severityLabel: f.severityLabel,
          datasetVersionId: ids.datasetVersionId, contextPackageId: ids.contextPackageId,
        },
        select: { id: true },
      });
      findingIds.push(id);
    }
    await inChunks(caseRows, (rows) => tx.findingCase.createMany({
      data: rows.map(([i, caseUid, caseId, rank, supportMetric, supportValue]) => ({ findingId: findingIds[i]!, projectId, caseUid, caseId, rank, supportMetric, supportValue })),
    }));
    await tx.analysisRun.update({ where: { id: runId }, data: { monitoringStatus: "completed", monitoringError: null } });
    return findingIds.length;
  });
}

export async function markMonitoringFailed(job: RunJob & { message: string }): Promise<void> {
  await db().analysisRun.updateMany({ where: { id: job.analysisRunId }, data: { monitoringStatus: "failed", monitoringError: job.message.slice(0, 500) } });
}
