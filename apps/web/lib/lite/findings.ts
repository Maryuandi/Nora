import "server-only";
import { jsonAs, plain, Prisma } from "@nora/db";
import type { Viewer } from "./auth";
import { db } from "./db";
import { badRequest, notFound } from "./http";
import { can } from "./projects";

export const FINDING_TYPES = ["bottleneck_indication", "high_rework", "rule_non_compliance", "bpmn_deviation", "aging_backlog", "worsening_trend"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];
export const DEFAULT_TYPES: FindingType[] = ["bottleneck_indication", "high_rework"];

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

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity);

// Orderings of the finding list; ties fall back to id.
export const FINDING_SORTS = {
  severity: (a: FindingRow, b: FindingRow) => b.severityScore - a.severityScore,
  contribution: (a: FindingRow, b: FindingRow) => desc(a.metrics.contributionShare, b.metrics.contributionShare),
  cases: (a: FindingRow, b: FindingRow) => b.caseCount - a.caseCount,
  newest: (a: FindingRow, b: FindingRow) => b.createdAt.localeCompare(a.createdAt),
} as const;

const FINDING_SELECT = {
  id: true, type: true, title: true, summary: true, severityScore: true, severityLabel: true, metrics: true, population: true, subject: true,
  analysisRunId: true, createdAt: true, datasetVersionId: true, contextPackageId: true, _count: { select: { findingCases: true } },
  analysisRun: { select: { createdAt: true } }, datasetVersion: { select: { name: true, status: true } }, contextPackage: { select: { name: true, status: true } },
} as const satisfies Prisma.FindingSelect;

const toFindingRow = ({ _count, analysisRun, datasetVersion: d, contextPackage: p, ...f }: Prisma.FindingGetPayload<{ select: typeof FINDING_SELECT }>): FindingRow => ({
  ...f, type: f.type as FindingType, metrics: jsonAs<FindingRow["metrics"]>(f.metrics), population: jsonAs<FindingRow["population"]>(f.population),
  subject: jsonAs<FindingRow["subject"]>(f.subject), caseCount: _count.findingCases, runCreatedAt: analysisRun.createdAt.toISOString(), createdAt: f.createdAt.toISOString(),
  datasetName: d.name, contextName: p.name, datasetIsCurrent: d.status === "published", contextIsCurrent: p.status === "active",
});

/** Findings of one run (default: the latest completed run on the current dataset and context). */
export async function listFindings(viewer: Viewer, projectId: string, opts: { runId?: string | null; types?: string[]; sort?: string } = {}) {
  await can(viewer, "project.read", projectId);
  let runId = opts.runId ?? null;
  if (!runId) {
    const runs = await db().analysisRun.findMany({
      where: { projectId, status: "completed", monitoringStatus: "completed" }, orderBy: { completedAt: "desc" },
      select: { id: true, datasetVersion: { select: { status: true } }, contextPackage: { select: { status: true } } },
    });
    runId = (runs.find((r) => r.datasetVersion.status === "published" && r.contextPackage.status === "active") ?? runs[0])?.id ?? null;
  }
  if (!runId) return { runId: null, findings: [] as FindingRow[], totals: {} as Record<string, number> };
  const types = (opts.types?.length ? opts.types : DEFAULT_TYPES).filter((t) => (FINDING_TYPES as readonly string[]).includes(t));
  const sort = FINDING_SORTS[(opts.sort ?? "severity") as keyof typeof FINDING_SORTS] ?? FINDING_SORTS.severity;
  const rows = await db().finding.findMany({ where: { projectId, analysisRunId: runId, type: { in: types } }, select: FINDING_SELECT });
  const findings = rows.map(toFindingRow).sort((a, b) => sort(a, b) || (a.id < b.id ? -1 : 1));
  const counts = await db().finding.groupBy({ by: ["type"], where: { projectId, analysisRunId: runId }, _count: { _all: true } });
  const totals = Object.fromEntries(counts.map((c) => [c.type, c._count._all]));
  return { runId, findings, totals };
}

export async function getFinding(viewer: Viewer, projectId: string, findingId: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(findingId)) throw notFound();
  const row = await db().finding.findFirst({
    where: { id: findingId, projectId },
    select: {
      ...FINDING_SELECT, thresholds: true, metricKey: true, metricVersion: true,
      analysisRun: { select: { createdAt: true, filterSpec: true, coverage: true, monitoringConfig: true, algorithmVersion: true } },
    },
  });
  if (!row) throw notFound();
  const m = await db().metricDefinition.findUnique({
    where: { key_version: { key: row.metricKey, version: row.metricVersion } }, select: { name: true, formula: true, population: true, description: true },
  });
  const r = row.analysisRun;
  return {
    ...toFindingRow(row), thresholds: jsonAs<Record<string, unknown>>(row.thresholds), metricKey: row.metricKey, metricVersion: row.metricVersion,
    metricName: m?.name ?? null, formula: m?.formula ?? null, metricPopulation: m?.population ?? null, metricDescription: m?.description ?? null,
    runFilter: jsonAs<Record<string, unknown>>(r.filterSpec), runCoverage: jsonAs<Record<string, number> | null>(r.coverage),
    runConfig: jsonAs<Record<string, unknown> | null>(r.monitoringConfig), algorithmVersion: r.algorithmVersion,
  };
}

export const FINDING_CASE_SORTS = {
  support: "fc.rank ASC",
  duration: "c.duration_s DESC NULLS LAST",
  events: "c.event_count DESC",
  start: "c.start_time DESC",
  additional: "additional_s DESC NULLS LAST",
} as const;

/** Supporting cases of a finding; total always equals the stored finding_cases count. */
export async function listFindingCases(viewer: Viewer, projectId: string, findingId: string, q: { sort?: string; dir?: string; page?: number; size?: number; search?: string }) {
  const f = await getFinding(viewer, projectId, findingId);
  const size = Math.min(Math.max(q.size ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const key = (q.sort && q.sort in FINDING_CASE_SORTS ? q.sort : "support") as keyof typeof FINDING_CASE_SORTS;
  if (key === "additional" && f.type !== "high_rework") throw badRequest("Durasi tambahan hanya untuk temuan rework");
  let order: string = FINDING_CASE_SORTS[key];
  if (q.dir === "asc") order = order.replace("DESC", "ASC").replace("rank ASC", "rank DESC");
  const without = Number(f.metrics.medianWithoutSeconds ?? NaN);
  const search = q.search?.trim() || null;
  // ILIKE's default escape is backslash; escape it and the wildcards so the search is literal.
  const like = search && `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  // Raw: a left join to the run's case rows with a per-request sort; the order comes from FINDING_CASE_SORTS only.
  const rows = await db().$queryRaw<{ caseUid: string; caseId: string; rank: number; supportMetric: string; supportValue: number | null; startTime: Date | null; endTime: Date | null; durationSeconds: number | null; eventCount: number | null; additional_s: number | null }[]>`
    SELECT fc.case_uid AS "caseUid", fc.case_id AS "caseId", fc.rank, fc.support_metric AS "supportMetric", fc.support_value AS "supportValue",
           c.start_time AS "startTime", c.end_time AS "endTime", c.duration_s AS "durationSeconds", c.event_count AS "eventCount",
           c.duration_s - ${Number.isFinite(without) ? without : null}::float8 AS additional_s
      FROM finding_cases fc LEFT JOIN analysis_cases c ON c.run_id = ${f.analysisRunId}::uuid AND c.case_uid = fc.case_uid
     WHERE fc.finding_id = ${findingId}::uuid AND (${like}::text IS NULL OR fc.case_id ILIKE ${like}) ORDER BY ${Prisma.raw(order)}, fc.case_uid LIMIT ${size} OFFSET ${(page - 1) * size}`;
  return {
    total: search ? await db().findingCase.count({ where: { findingId, caseId: { contains: search, mode: "insensitive" } } }) : f.caseCount, page, size,
    cases: rows.map(({ additional_s, ...r }) => ({ ...plain(r), additionalSeconds: additional_s, selectedWaitSeconds: r.supportMetric === "wait_seconds" ? r.supportValue : null })),
  };
}

/** Catalog hypotheses that could explain this finding type and subject: shown as unproven, never as cause. */
export async function relatedHypotheses(projectId: string, finding: { type: string; subject: Record<string, unknown>; contextPackageId: string }) {
  const refs = await db().contextPackageRef.findMany({ where: { packageId: finding.contextPackageId, refType: "hypothesis" }, select: { refId: true } });
  const rows = await db().hypothesis.findMany({ where: { id: { in: refs.map((r) => r.refId) } }, orderBy: { itemKey: "asc" }, select: { itemKey: true, version: true, payload: true } });
  const acts = [finding.subject.from, finding.subject.to].filter((a): a is string => typeof a === "string" && !!a);
  return rows
    .map((h) => ({ key: h.itemKey, version: h.version, payload: jsonAs<{ statement: string; findingTypes: string[]; activities: string[]; symptoms: string[] }>(h.payload) }))
    .filter((h) => (!h.payload.findingTypes.length || h.payload.findingTypes.includes(finding.type))
      && (!h.payload.activities.length || !acts.length || h.payload.activities.some((a) => acts.includes(a))));
}
