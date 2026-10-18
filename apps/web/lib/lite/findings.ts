import "server-only";
import type { Viewer } from "./auth";
import { db } from "./db";
import { badRequest, notFound } from "./http";
import { can } from "./projects";

export const FINDING_TYPES = ["bottleneck_indication", "high_rework", "rule_non_compliance", "bpmn_deviation", "aging_backlog", "worsening_trend"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];
export const DEFAULT_TYPES: FindingType[] = ["bottleneck_indication", "high_rework"];

// Column names of the listFindings subquery.
export const FINDING_SORTS = {
  severity: `"severityScore" DESC`,
  contribution: "(f.metrics->>'contributionShare')::float8 DESC NULLS LAST",
  cases: "case_count DESC",
  newest: `"createdAt" DESC`,
} as const;

export interface FindingRow {
  id: string;
  type: FindingType;
  title: string;
  summary: string;
  severityScore: number;
  severityLabel: string;
  metrics: Record<string, number | null>;
  population: { cases: number; events: number; periodStart: string | null; periodEnd: string | null; smallSample: boolean };
  subject: Record<string, unknown>;
  caseCount: number;
  analysisRunId: string;
  runCreatedAt: string;
  createdAt: string;
  datasetVersionId: string;
  datasetName: string;
  contextPackageId: string;
  contextName: string;
  datasetIsCurrent: boolean;
  contextIsCurrent: boolean;
}

const COLS = `f.id, f.type, f.title, f.summary, f.severity_score AS "severityScore", f.severity_label AS "severityLabel", f.metrics, f.population, f.subject,
  (SELECT count(*) FROM finding_cases c WHERE c.finding_id = f.id) AS case_count, f.analysis_run_id AS "analysisRunId", r.created_at AS "runCreatedAt",
  f.created_at AS "createdAt", f.dataset_version_id AS "datasetVersionId", d.name AS "datasetName", f.context_package_id AS "contextPackageId", p.name AS "contextName",
  d.status = 'published' AS "datasetIsCurrent", p.status = 'active' AS "contextIsCurrent"`;
const FROM = `findings f JOIN analysis_runs r ON r.id = f.analysis_run_id JOIN dataset_versions d ON d.id = f.dataset_version_id JOIN context_packages p ON p.id = f.context_package_id`;

/** Findings of one run (default: the latest completed run on the current dataset and context). */
export async function listFindings(viewer: Viewer, projectId: string, opts: { runId?: string | null; types?: string[]; sort?: string } = {}) {
  await can(viewer, "project.read", projectId);
  let runId = opts.runId ?? null;
  if (!runId) {
    runId = (await db().query<{ id: string }>(
      `SELECT r.id FROM analysis_runs r JOIN dataset_versions d ON d.id = r.dataset_version_id JOIN context_packages p ON p.id = r.context_package_id
        WHERE r.project_id = $1 AND r.status = 'completed' AND r.monitoring_status = 'completed'
        ORDER BY (d.status = 'published' AND p.status = 'active') DESC, r.completed_at DESC LIMIT 1`, [projectId],
    )).rows[0]?.id ?? null;
  }
  if (!runId) return { runId: null, findings: [] as FindingRow[], totals: {} as Record<string, number> };
  const types = (opts.types?.length ? opts.types : DEFAULT_TYPES).filter((t) => (FINDING_TYPES as readonly string[]).includes(t));
  const sort = FINDING_SORTS[(opts.sort ?? "severity") as keyof typeof FINDING_SORTS] ?? FINDING_SORTS.severity;
  const { rows } = await db().query<FindingRow & { case_count: number }>(
    `SELECT * FROM (SELECT ${COLS} FROM ${FROM} WHERE f.project_id = $1 AND f.analysis_run_id = $2 AND f.type = ANY($3::text[])) f ORDER BY ${sort}, f.id`,
    [projectId, runId, types],
  );
  const totals = Object.fromEntries((await db().query<{ type: string; n: number }>("SELECT type, count(*) AS n FROM findings WHERE project_id = $1 AND analysis_run_id = $2 GROUP BY type", [projectId, runId])).rows.map((r) => [r.type, r.n]));
  return { runId, findings: rows.map(({ case_count, ...r }) => ({ ...r, caseCount: case_count })), totals };
}

export async function getFinding(viewer: Viewer, projectId: string, findingId: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(findingId)) throw notFound();
  const row = (await db().query<FindingRow & { case_count: number; thresholds: Record<string, unknown>; metricKey: string; metricVersion: number; metricName: string; formula: string; metricPopulation: string; metricDescription: string; runFilter: unknown; runCoverage: Record<string, number> | null; runConfig: unknown; algorithmVersion: string }>(
    `SELECT ${COLS}, f.thresholds, f.metric_key AS "metricKey", f.metric_version AS "metricVersion", m.name AS "metricName", m.formula, m.population AS "metricPopulation",
            m.description AS "metricDescription", r.filter_spec AS "runFilter", r.coverage AS "runCoverage", r.monitoring_config AS "runConfig", r.algorithm_version AS "algorithmVersion"
       FROM ${FROM} LEFT JOIN metric_definitions m ON m.key = f.metric_key AND m.version = f.metric_version
      WHERE f.id = $1 AND f.project_id = $2`, [findingId, projectId],
  )).rows[0];
  if (!row) throw notFound();
  const { case_count, ...rest } = row;
  return { ...rest, caseCount: case_count };
}

export const FINDING_CASE_SORTS = {
  support: "fc.rank ASC",
  duration: "c.duration_s DESC NULLS LAST",
  events: "c.event_count DESC",
  start: "c.start_time DESC",
  additional: "additional_s DESC NULLS LAST",
} as const;

/** Supporting cases of a finding; total always equals the stored finding_cases count. */
export async function listFindingCases(viewer: Viewer, projectId: string, findingId: string, q: { sort?: string; dir?: string; page?: number; size?: number }) {
  const f = await getFinding(viewer, projectId, findingId);
  const size = Math.min(Math.max(q.size ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const key = (q.sort && q.sort in FINDING_CASE_SORTS ? q.sort : "support") as keyof typeof FINDING_CASE_SORTS;
  if (key === "additional" && f.type !== "high_rework") throw badRequest("Durasi tambahan hanya untuk temuan rework");
  let order: string = FINDING_CASE_SORTS[key];
  if (q.dir === "asc") order = order.replace("DESC", "ASC").replace("rank ASC", "rank DESC");
  const without = Number(f.metrics.medianWithoutSeconds ?? NaN);
  const { rows } = await db().query(
    `SELECT fc.case_uid AS "caseUid", fc.case_id AS "caseId", fc.rank, fc.support_metric AS "supportMetric", fc.support_value AS "supportValue",
            c.start_time AS "startTime", c.end_time AS "endTime", c.duration_s AS "durationSeconds", c.event_count AS "eventCount",
            c.duration_s - $3::float8 AS additional_s
       FROM finding_cases fc LEFT JOIN analysis_cases c ON c.run_id = $2 AND c.case_uid = fc.case_uid
      WHERE fc.finding_id = $1 ORDER BY ${order}, fc.case_uid LIMIT ${size} OFFSET ${(page - 1) * size}`,
    [findingId, f.analysisRunId, Number.isFinite(without) ? without : null],
  );
  return {
    total: f.caseCount, page, size,
    cases: rows.map((r) => ({ ...r, additionalSeconds: r.additional_s, additional_s: undefined, selectedWaitSeconds: r.supportMetric === "wait_seconds" ? r.supportValue : null })),
  };
}

/** Catalog hypotheses that could explain this finding type and subject: shown as unproven, never as cause. */
export async function relatedHypotheses(projectId: string, finding: { type: string; subject: Record<string, unknown>; contextPackageId: string }) {
  const { rows } = await db().query<{ key: string; version: number; payload: { statement: string; findingTypes: string[]; activities: string[]; symptoms: string[] } }>(
    `SELECT h.item_key AS key, h.version, h.payload FROM context_package_refs r JOIN hypotheses h ON h.id = r.ref_id
      WHERE r.package_id = $1 AND r.ref_type = 'hypothesis' ORDER BY h.item_key`, [finding.contextPackageId],
  );
  const acts = [finding.subject.from, finding.subject.to].filter(Boolean) as string[];
  return rows.filter((h) => (!h.payload.findingTypes.length || h.payload.findingTypes.includes(finding.type))
    && (!h.payload.activities.length || !acts.length || h.payload.activities.some((a) => acts.includes(a))));
}
