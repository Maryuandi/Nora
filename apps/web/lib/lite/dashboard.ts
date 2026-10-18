import "server-only";
import { MonitoringConfig } from "@nora/contracts";
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

/** Cards, trend and section states all read the stored metric records of one run. */
export async function getDashboard(viewer: Viewer, projectId: string, runId: string) {
  const run = await getRun(viewer, projectId, runId);
  const [metrics, series, rework, conformance, rules, findings] = await Promise.all([
    db().query<MetricView>(
      `SELECT m.metric_key AS key, m.metric_version AS version, m.value, m.unit, m.available, m.reason, m.small_sample AS "smallSample", m.population,
              d.name, d.description, d.formula, d.population AS "definitionPopulation"
         FROM analysis_metrics m JOIN metric_definitions d ON d.key = m.metric_key AND d.version = m.metric_version WHERE m.run_id = $1`, [runId]),
    db().query(`SELECT bucket, started, completed, median_duration_s AS "medianDurationSeconds" FROM analysis_metric_series WHERE run_id = $1 ORDER BY bucket`, [runId]),
    db().query(`SELECT result FROM rework_results WHERE run_id = $1`, [runId]),
    db().query(`SELECT status, reason, fitness, mapping_version AS "mappingVersion", mismatches, variants FROM conformance_results WHERE run_id = $1`, [runId]),
    db().query(`SELECT rule_id AS "ruleId", rule_key AS key, rule_version AS version, name, compliant, non_compliant AS "nonCompliant", not_evaluable AS "notEvaluable", reasons
                  FROM rule_evaluations WHERE run_id = $1 ORDER BY name`, [runId]),
    listRunFindings(viewer, projectId, runId),
  ]);
  return {
    run,
    metrics: Object.fromEntries(metrics.rows.map((m) => [m.key, m])) as Record<string, MetricView>,
    series: series.rows,
    rework: rework.rows[0]?.result ?? null,
    conformance: conformance.rows[0] ?? null,
    rules: rules.rows,
    findings,
  };
}

export async function listBottlenecks(viewer: Viewer, projectId: string, runId: string) {
  await getRun(viewer, projectId, runId);
  const { rows } = await db().query(
    `SELECT t.from_activity AS "from", t.to_activity AS "to", t.rank, t.occurrences, t.case_count AS "caseCount", t.median_wait_s AS "medianSeconds", t.p90_wait_s AS "p90Seconds",
            t.total_wait_s AS "totalSeconds", t.contribution_share AS "contributionShare", t.affected_case_share AS "affectedCaseShare", t.delay_excess AS "delayExcess",
            t.severity, t.is_bottleneck AS "isBottleneck",
            (SELECT f.id FROM findings f WHERE f.analysis_run_id = t.run_id AND f.type = 'bottleneck_indication'
               AND f.subject->>'from' = t.from_activity AND f.subject->>'to' = t.to_activity) AS "findingId"
       FROM transition_metrics t WHERE t.run_id = $1 ORDER BY t.rank LIMIT 50`, [runId],
  );
  return rows;
}

export async function listRunFindings(viewer: Viewer, projectId: string, runId: string) {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query(
    `SELECT f.id, f.type, f.title, f.summary, f.severity_score AS "severityScore", f.severity_label AS "severityLabel", f.metrics, f.subject,
            (SELECT count(*) FROM finding_cases c WHERE c.finding_id = f.id) AS "caseCount"
       FROM findings f WHERE f.project_id = $1 AND f.analysis_run_id = $2 ORDER BY f.severity_score DESC, f.title`, [projectId, runId],
  );
  return rows as { id: string; type: string; title: string; summary: string; severityScore: number; severityLabel: string; metrics: Record<string, number>; subject: Record<string, unknown>; caseCount: number }[];
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
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`monitoring:${projectId}`]);
    const version = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM monitoring_configs WHERE project_id = $1", [projectId])).rows[0]!.v ?? 0) + 1;
    const { rows } = await tx.query<{ id: string }>("INSERT INTO monitoring_configs (project_id, version, config, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [projectId, version, JSON.stringify(parsed.data), viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "analysis.settings", objectType: "monitoring_config", objectId: rows[0]!.id, correlationId, metadata: { version } });
    return { id: rows[0]!.id, version, config: parsed.data };
  });
}
