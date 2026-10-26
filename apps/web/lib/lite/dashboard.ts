import "server-only";
import { MonitoringConfig } from "@nora/contracts";
import { advisoryLock, day, jsonAs } from "@nora/db";
import { audit } from "./audit";
import { currentMonitoringConfig, getRun } from "./analysis";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest } from "./http";
import { can } from "./projects";

export interface MetricView {
  key: string;
  version: number;
  value: number | null;
  unit: string;
  available: boolean;
  reason: string | null;
  smallSample: boolean;
  population: { cases: number; events: number; periodStart: string | null; periodEnd: string | null; basis: string | null };
  name: string;
  description: string;
  formula: string;
  definitionPopulation: string;
}

/** Rework section as the monitoring worker stores it. */
export interface ReworkResult {
  available: boolean;
  reason: string | null;
  caseCount: number;
  caseShare: number | null;
  avgRepetitions: number | null;
  medianWithSeconds: number | null;
  medianWithoutSeconds: number | null;
  byRule: { index: number; rule: Record<string, unknown>; cases: number }[];
  comparisonNote?: string;
}

/** Cards, trend and section states all read the stored metric records of one run. */
export async function getDashboard(viewer: Viewer, projectId: string, runId: string) {
  const run = await getRun(viewer, projectId, runId);
  const [metrics, series, rework, conformance, rules, findings] = await Promise.all([
    db().analysisMetric.findMany({ where: { runId }, include: { metricDefinition: { select: { name: true, description: true, formula: true, population: true } } } }),
    db().analysisMetricSeries.findMany({ where: { runId }, orderBy: { bucket: "asc" }, select: { bucket: true, started: true, completed: true, medianDurationS: true } }),
    db().reworkResult.findUnique({ where: { runId }, select: { result: true } }),
    db().conformanceResult.findUnique({ where: { runId }, select: { status: true, reason: true, fitness: true, mappingVersion: true, mismatches: true, variants: true } }),
    db().ruleEvaluation.findMany({
      where: { runId }, orderBy: { name: "asc" },
      select: { ruleId: true, ruleKey: true, ruleVersion: true, name: true, compliant: true, nonCompliant: true, notEvaluable: true, reasons: true },
    }),
    listRunFindings(viewer, projectId, runId),
  ]);
  return {
    run,
    metrics: Object.fromEntries(metrics.map(({ metricDefinition: d, ...m }): [string, MetricView] => [m.metricKey, {
      key: m.metricKey, version: m.metricVersion, value: m.value, unit: m.unit, available: m.available, reason: m.reason, smallSample: m.smallSample,
      population: jsonAs<MetricView["population"]>(m.population), name: d.name, description: d.description, formula: d.formula, definitionPopulation: d.population,
    }])),
    series: series.map((s) => ({ bucket: day(s.bucket), started: s.started, completed: s.completed, medianDurationSeconds: s.medianDurationS })),
    rework: rework ? jsonAs<ReworkResult>(rework.result) : null,
    conformance: conformance && {
      ...conformance, mismatches: jsonAs<{ kind: string; activity: string; cases: number }[]>(conformance.mismatches),
      variants: jsonAs<Record<string, unknown>[]>(conformance.variants),
    },
    rules: rules.map(({ ruleKey, ruleVersion, reasons, ...r }) => ({ ...r, key: ruleKey, version: ruleVersion, reasons: jsonAs<{ reason: string; count: number }[]>(reasons) })),
    findings,
  };
}

export async function listBottlenecks(viewer: Viewer, projectId: string, runId: string) {
  await getRun(viewer, projectId, runId);
  const [rows, findings] = await Promise.all([
    db().transitionMetric.findMany({ where: { runId }, orderBy: { rank: "asc" }, take: 50 }),
    db().finding.findMany({ where: { analysisRunId: runId, type: "bottleneck_indication" }, select: { id: true, subject: true } }),
  ]);
  const findingFor = new Map(findings.map((f) => {
    const s = jsonAs<{ from?: string; to?: string }>(f.subject);
    return [`${s.from}\u0000${s.to}`, f.id];
  }));
  return rows.map((t) => ({
    from: t.fromActivity, to: t.toActivity, rank: t.rank, occurrences: Number(t.occurrences), caseCount: Number(t.caseCount), medianSeconds: t.medianWaitS,
    p90Seconds: t.p90WaitS, totalSeconds: t.totalWaitS, contributionShare: t.contributionShare, affectedCaseShare: t.affectedCaseShare, delayExcess: t.delayExcess,
    severity: t.severity, isBottleneck: t.isBottleneck, findingId: findingFor.get(`${t.fromActivity}\u0000${t.toActivity}`) ?? null,
  }));
}

export async function listRunFindings(viewer: Viewer, projectId: string, runId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().finding.findMany({
    where: { projectId, analysisRunId: runId }, orderBy: [{ severityScore: "desc" }, { title: "asc" }],
    select: { id: true, type: true, title: true, summary: true, severityScore: true, severityLabel: true, metrics: true, subject: true, _count: { select: { findingCases: true } } },
  });
  return rows.map(({ _count, ...f }) => ({
    ...f, metrics: jsonAs<Record<string, number>>(f.metrics), subject: jsonAs<Record<string, unknown>>(f.subject), caseCount: _count.findingCases,
  }));
}

export async function getSettings(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  return currentMonitoringConfig(projectId);
}

/** Every threshold change is a new config version and an audit entry; earlier runs keep their own copy. */
export async function saveSettings(viewer: Viewer, projectId: string, input: unknown, correlationId: string) {
  await can(viewer, "analysis.settings", projectId);
  const parsed = MonitoringConfig.safeParse(input);
  if (!parsed.success) throw badRequest("Konfigurasi ambang tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  return withTx(async (tx) => {
    await advisoryLock(tx, `monitoring:${projectId}`);
    const max = await tx.monitoringConfig.aggregate({ where: { projectId }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    const { id } = await tx.monitoringConfig.create({ data: { projectId, version, config: parsed.data, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "analysis.settings", objectType: "monitoring_config", objectId: id, correlationId, metadata: { version } });
    return { id, version, config: parsed.data };
  });
}
