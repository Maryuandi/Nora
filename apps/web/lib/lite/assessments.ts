import "server-only";
import { QuestionSpec, RELEVANCE_OPTIONS } from "@nora/contracts";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { can } from "./projects";

export async function requestAssessmentRun(viewer: Viewer, projectId: string, findingId: string, correlationId: string, trigger: "manual" | "recommendation_refresh" = "manual") {
  await can(viewer, "assessment.run", projectId);
  if (!(await db().query("SELECT 1 FROM findings WHERE id = $1 AND project_id = $2", [findingId, projectId])).rows.length) throw notFound();
  const running = (await db().query<{ id: string }>("SELECT id FROM assessment_runs WHERE finding_id = $1 AND status IN ('queued', 'running') LIMIT 1", [findingId])).rows[0];
  if (running) return { id: running.id, reused: true };
  const id = await withTx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>("INSERT INTO assessment_runs (project_id, finding_id, trigger, requested_by) VALUES ($1, $2, $3, $4) RETURNING id", [projectId, findingId, trigger, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.request", objectType: "assessment_run", objectId: rows[0]!.id, correlationId, metadata: { findingId, trigger } });
    return rows[0]!.id;
  });
  await startJob("assessmentWorkflow", `assessment-${id}`, [{ projectId, findingId, assessmentRunId: id, requestedBy: viewer.id, correlationId }]);
  return { id, reused: false };
}

export interface AssessmentView {
  id: string;
  status: string;
  candidateLinkId: string;
  candidateKey: string;
  candidateVersion: number;
  candidateAction: string;
  conclusion: string | null;
  distribution: { option: string; probability: number }[] | null;
  topProbability: number | null;
  margin: number | null;
  sufficiencyProbability: number | null;
  totalScore: number | null;
  missingCriteria: string[];
  adapter: string;
  model: string | null;
  modelVersion: string | null;
  questionSpecs: { task: string; version: number }[];
  rubricVersion: number | null;
  evidenceBundleId: string | null;
  contextLimited: boolean;
  contextMaybeStale: boolean;
  errorMessage: string | null;
  createdAt: string;
  criteria: { key: string; weight: number; score: number | null; normalized: number | null; probability: number | null }[];
  corrections: { id: string; kind: string; conclusion: string | null; reason: string; goldCandidate: boolean; createdAt: string; by: string | null }[];
  /** latest correction, else confirmation, else the model result */
  effective: { conclusion: string | null; source: "correction" | "confirmation" | "model" };
  specSuperseded: boolean;
}

const COLS = `a.id, a.status, a.candidate_link_id AS "candidateLinkId", l.candidate_key AS "candidateKey", l.candidate_version AS "candidateVersion", i.payload->>'action' AS "candidateAction",
  a.conclusion, a.distribution, a.top_probability AS "topProbability", a.margin, a.sufficiency_probability AS "sufficiencyProbability", a.total_score AS "totalScore",
  a.missing_criteria AS "missingCriteria", a.adapter, a.model, a.model_version AS "modelVersion", a.question_specs AS "questionSpecs", a.rubric_version AS "rubricVersion",
  a.evidence_bundle_id AS "evidenceBundleId", a.context_limited AS "contextLimited", a.context_maybe_stale AS "contextMaybeStale", a.error_message AS "errorMessage", a.created_at AS "createdAt",
  coalesce((SELECT json_agg(json_build_object('key', c.criterion_key, 'weight', c.weight, 'score', c.score, 'normalized', c.normalized, 'probability', c.probability) ORDER BY c.criterion_key)
            FROM assessment_criterion_results c WHERE c.assessment_id = a.id), '[]') AS criteria,
  coalesce((SELECT json_agg(json_build_object('id', x.id, 'kind', x.kind, 'conclusion', x.conclusion, 'reason', x.reason, 'goldCandidate', x.gold_candidate, 'createdAt', x.created_at, 'by', u.name) ORDER BY x.created_at)
            FROM assessment_corrections x LEFT JOIN users u ON u.id = x.created_by WHERE x.assessment_id = a.id), '[]') AS corrections,
  EXISTS (SELECT 1 FROM jsonb_array_elements(a.question_specs) s JOIN question_specs q ON q.project_id = a.project_id AND q.task = s->>'task' AND q.version = (s->>'version')::int AND q.status = 'superseded') AS "specSuperseded"`;

function withEffective(a: Omit<AssessmentView, "effective">): AssessmentView {
  const corr = [...a.corrections].reverse().find((c) => c.kind === "correct");
  if (corr) return { ...a, effective: { conclusion: corr.conclusion, source: "correction" } };
  if (a.corrections.some((c) => c.kind === "confirm")) return { ...a, effective: { conclusion: a.conclusion, source: "confirmation" } };
  return { ...a, effective: { conclusion: a.conclusion, source: "model" } };
}

/** Latest assessment per candidate for a finding, plus candidates stopped by preconditions (never sent to Jev). */
export async function findingAssessments(viewer: Viewer, projectId: string, findingId: string) {
  await can(viewer, "project.read", projectId);
  const latest = (await db().query(
    `SELECT DISTINCT ON (a.candidate_link_id) ${COLS}
       FROM assessments a JOIN candidate_links l ON l.id = a.candidate_link_id LEFT JOIN interventions i ON i.id = l.candidate_id
      WHERE a.project_id = $1 AND a.finding_id = $2 ORDER BY a.candidate_link_id, a.created_at DESC`, [projectId, findingId],
  )).rows.map(withEffective);
  const blocked = (await db().query(
    `SELECT l.id, l.candidate_key AS "candidateKey", i.payload->>'action' AS "candidateAction", l.precondition_status AS "preconditionStatus", l.precondition_checks AS checks
       FROM candidate_links l LEFT JOIN interventions i ON i.id = l.candidate_id WHERE l.project_id = $1 AND l.finding_id = $2 AND l.precondition_status <> 'eligible' ORDER BY l.candidate_key`, [projectId, findingId],
  )).rows;
  const run = (await db().query(
    `SELECT id, status, error_message AS "errorMessage", created_at AS "createdAt", completed_at AS "completedAt" FROM assessment_runs WHERE project_id = $1 AND finding_id = $2 ORDER BY created_at DESC LIMIT 1`, [projectId, findingId],
  )).rows[0] ?? null;
  return { assessments: latest.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1)), blocked, run };
}

export async function getAssessment(viewer: Viewer, projectId: string, id: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const row = (await db().query(`SELECT ${COLS}, a.finding_id AS "findingId" FROM assessments a JOIN candidate_links l ON l.id = a.candidate_link_id LEFT JOIN interventions i ON i.id = l.candidate_id WHERE a.id = $1 AND a.project_id = $2`, [id, projectId])).rows[0];
  if (!row) throw notFound();
  const usage = (await db().query(
    `SELECT operation, provider, model, model_version AS "modelVersion", request_id AS "requestId", latency_ms AS "latencyMs", cost, raw_key AS "rawKey", created_at AS "createdAt"
       FROM model_usage_events WHERE subject_id = $1 ORDER BY id`, [id],
  )).rows;
  return { ...withEffective(row), findingId: row.findingId, usage };
}

/** Correction never overwrites the model output; it is stored next to it and needs a reason. */
export async function correctAssessment(viewer: Viewer, projectId: string, id: string, input: { kind: "confirm" | "correct"; conclusion?: string | null; reason: string; goldCandidate?: boolean }, correlationId: string) {
  await can(viewer, "assessment.correct", projectId);
  if (input.kind === "correct" && !(RELEVANCE_OPTIONS as readonly string[]).includes(input.conclusion ?? "")) throw badRequest("Kesimpulan koreksi tidak valid", { conclusion: "Pilih kesimpulan" });
  if (!input.reason.trim()) throw badRequest("Alasan wajib diisi", { reason: "Alasan wajib diisi" });
  return withTx(async (tx) => {
    const a = (await tx.query<{ status: string; conclusion: string | null }>("SELECT status, conclusion FROM assessments WHERE id = $1 AND project_id = $2", [id, projectId])).rows[0];
    if (!a) throw notFound();
    if (!["needs_review", "automatic", "insufficient_information"].includes(a.status)) throw conflict(`Penilaian berstatus ${a.status} tidak dapat dikonfirmasi atau dikoreksi`);
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO assessment_corrections (project_id, assessment_id, kind, conclusion, reason, gold_candidate, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [projectId, id, input.kind, input.kind === "correct" ? input.conclusion : a.conclusion, input.reason.trim(), !!input.goldCandidate, viewer.id],
    );
    if (input.goldCandidate) {
      await tx.query(
        `INSERT INTO gold_set_items (project_id, assessment_id, correction_id, label) VALUES ($1, $2, $3, $4)
         ON CONFLICT (assessment_id) DO UPDATE SET correction_id = EXCLUDED.correction_id, label = EXCLUDED.label`,
        [projectId, id, rows[0]!.id, input.kind === "correct" ? input.conclusion : a.conclusion],
      );
    }
    await audit(tx, { projectId, actorId: viewer.id, action: `assessment.${input.kind}`, objectType: "assessment", objectId: id, correlationId, metadata: { from: a.conclusion, to: input.conclusion ?? a.conclusion, gold: !!input.goldCandidate } });
    return { id: rows[0]!.id };
  });
}

export async function listSpecs(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  return (await db().query(`SELECT id, task, primitive, version, spec, status, created_at AS "createdAt" FROM question_specs WHERE project_id = $1 ORDER BY task, version DESC`, [projectId])).rows;
}

/** New spec version: the old one is superseded; results keep the version they were asked with. */
export async function createSpec(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "assessment.run", projectId);
  const parsed = QuestionSpec.omit({ version: true }).safeParse(raw);
  if (!parsed.success) throw badRequest("Spesifikasi tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  return withTx(async (tx) => {
    const v = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM question_specs WHERE project_id = $1 AND task = $2", [projectId, parsed.data.task])).rows[0]!.v ?? 0) + 1;
    await tx.query("UPDATE question_specs SET status = 'superseded' WHERE project_id = $1 AND task = $2 AND status = 'active'", [projectId, parsed.data.task]);
    const { rows } = await tx.query<{ id: string }>("INSERT INTO question_specs (project_id, task, primitive, version, spec, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [projectId, parsed.data.task, parsed.data.primitive, v, JSON.stringify({ ...parsed.data, version: v }), viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.spec", objectType: "question_spec", objectId: rows[0]!.id, correlationId, metadata: { task: parsed.data.task, version: v, topThreshold: parsed.data.topThreshold, marginThreshold: parsed.data.marginThreshold } });
    return { id: rows[0]!.id, version: v };
  });
}

/** Gold set and a simple evaluation: accuracy of the model conclusion and Brier score of its probabilities. */
export async function goldSet(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const items = (await db().query(
    `SELECT g.id, g.label, a.conclusion AS "modelConclusion", a.distribution, l.candidate_key AS "candidateKey", g.created_at AS "createdAt"
       FROM gold_set_items g JOIN assessments a ON a.id = g.assessment_id JOIN candidate_links l ON l.id = a.candidate_link_id WHERE g.project_id = $1 ORDER BY g.created_at DESC`, [projectId],
  )).rows;
  const runs = (await db().query(`SELECT id, metrics, created_at AS "createdAt" FROM evaluation_runs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 10`, [projectId])).rows;
  return { items, runs };
}

export async function evaluateGoldSet(viewer: Viewer, projectId: string, correlationId: string) {
  await can(viewer, "assessment.run", projectId);
  const { items } = await goldSet(viewer, projectId);
  if (!items.length) throw conflict("Gold set masih kosong");
  const correct = items.filter((i) => i.modelConclusion === i.label).length;
  const brier = items.reduce((s, i) => s + (i.distribution as { option: string; probability: number }[] ?? []).reduce((t, d) => t + (d.probability - (d.option === i.label ? 1 : 0)) ** 2, 0), 0) / items.length;
  const metrics = { items: items.length, accuracy: correct / items.length, brierScore: brier };
  return withTx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>("INSERT INTO evaluation_runs (project_id, metrics, created_by) VALUES ($1, $2, $3) RETURNING id", [projectId, JSON.stringify(metrics), viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.evaluate", objectType: "evaluation_run", objectId: rows[0]!.id, correlationId, metadata: metrics });
    return { id: rows[0]!.id, metrics };
  });
}
