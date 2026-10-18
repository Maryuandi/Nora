import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { authorize, AuthzError } from "@nora/authz";
import { withTx } from "@nora/db";
import { aggregateScore, assessmentIdempotencyInput, Condition, DEFAULT_QUESTION_SPECS, EvidenceBundle, Intervention, QuestionSpec, RELEVANCE_OPTIONS, uncertainty } from "@nora/contracts";
import { getJson, putJson } from "@nora/storage";
import { ZodError } from "zod";
import { decisionAdapter } from "../adapters/decision.ts";
import { conditionFacts, evaluateCondition, type ConditionResult } from "../conditions.ts";
import { audit, db } from "../db.ts";

type Row = Record<string, any>;
export interface AssessmentJob { projectId: string; findingId: string; assessmentRunId: string; requestedBy: string; correlationId: string }

const one = async (sql: string, p: unknown[]): Promise<Row | undefined> => (await db().query(sql, p)).rows[0];
const many = async (sql: string, p: unknown[]): Promise<Row[]> => (await db().query(sql, p)).rows;

export async function activeQuestionSpecs(projectId: string): Promise<QuestionSpec[]> {
  for (const s of DEFAULT_QUESTION_SPECS) {
    await db().query(
      `INSERT INTO question_specs (project_id, task, primitive, version, spec) SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (SELECT 1 FROM question_specs WHERE project_id = $1 AND task = $2)`,
      [projectId, s.task, s.primitive, s.version, JSON.stringify(s)],
    );
  }
  return (await many("SELECT spec FROM question_specs WHERE project_id = $1 AND status = 'active' ORDER BY task", [projectId])).map((r) => QuestionSpec.parse(r.spec));
}

function findingActivities(f: Row): string[] {
  return [f.subject.from, f.subject.to, ...((f.subject.rules ?? []) as Row[]).flatMap((r) => [r.activity, r.from, r.to])].filter(Boolean);
}

/**
 * Candidates are catalog interventions of the finding's context package that match it structurally
 * (finding type, activities). Conditions are checked here, deterministically, before any model call.
 */
export async function buildCandidateLinks(projectId: string, findingId: string): Promise<{ id: string; status: string }[]> {
  const f = await one("SELECT * FROM findings WHERE id = $1 AND project_id = $2", [findingId, projectId]);
  if (!f) throw ApplicationFailure.nonRetryable("finding not found", "NotFound");
  const facts = await conditionFacts(findingId);
  const acts = findingActivities(f);
  const out: { id: string; status: string }[] = [];
  for (const iv of await many(
    `SELECT x.* FROM context_package_refs p JOIN interventions x ON x.id = p.ref_id WHERE p.package_id = $1 AND p.ref_type = 'intervention' ORDER BY x.item_key`, [f.context_package_id],
  )) {
    const c = Intervention.parse(iv.payload);
    const typeOk = !c.findingTypes.length || c.findingTypes.includes(f.type);
    const actOk = !c.activities.length || !acts.length || c.activities.some((a) => acts.includes(a));
    if (!typeOk || !actOk) continue;
    const checks: (ConditionResult | { condition: { ref: "capability"; key: string; op: "="; value: true }; status: string; actual: unknown; reason: string })[] = [];
    for (const cap of c.requiredCapabilities) {
      const cv = facts.caps[cap];
      checks.push({ condition: { ref: "capability", key: cap, op: "=", value: true }, status: cv == null ? "not_evaluable" : cv.available ? "pass" : "not_evaluable", actual: cv?.available ?? null, reason: cv?.available ? "Tersedia" : cv?.reason ?? "Kapabilitas tidak dikenal" });
    }
    for (const cond of c.conditions) checks.push(evaluateCondition(Condition.parse(cond), facts));
    const status = checks.some((x) => x.status === "fail") ? "not_eligible" : checks.some((x) => x.status === "not_evaluable") ? "insufficient_information" : "eligible";
    const row = await one(
      `INSERT INTO candidate_links (project_id, finding_id, context_package_id, candidate_type, candidate_id, candidate_key, candidate_version, origin, precondition_status, precondition_checks)
       VALUES ($1, $2, $3, 'intervention', $4, $5, $6, 'catalog', $7, $8)
       ON CONFLICT (finding_id, candidate_id) DO UPDATE SET precondition_status = EXCLUDED.precondition_status, precondition_checks = EXCLUDED.precondition_checks
       RETURNING id`,
      [projectId, findingId, f.context_package_id, iv.id, iv.item_key, iv.version, status, JSON.stringify(checks)],
    );
    out.push({ id: row!.id, status });
  }
  // Analyst additions keep their origin; their conditions are re-checked on every refresh.
  for (const ac of await many("SELECT * FROM analyst_candidates WHERE project_id = $1 AND finding_id = $2 ORDER BY created_at", [projectId, findingId])) {
    const checks = ((ac.payload.conditions ?? []) as unknown[]).map((cond) => evaluateCondition(Condition.parse(cond), facts));
    const status = checks.some((x) => x.status === "fail") ? "not_eligible" : checks.some((x) => x.status === "not_evaluable") ? "insufficient_information" : "eligible";
    const row = await one(
      `INSERT INTO candidate_links (project_id, finding_id, context_package_id, candidate_type, candidate_id, candidate_key, candidate_version, origin, precondition_status, precondition_checks)
       VALUES ($1, $2, $3, 'analyst', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (finding_id, candidate_id) DO UPDATE SET precondition_status = EXCLUDED.precondition_status, precondition_checks = EXCLUDED.precondition_checks
       RETURNING id`,
      [projectId, findingId, f.context_package_id, ac.id, `analis-${String(ac.id).slice(0, 8)}`, ac.version, `analis: ${ac.source_reason}`, status, JSON.stringify(checks)],
    );
    out.push({ id: row!.id, status });
  }
  return out;
}

/** Catalog interventions and analyst candidates share one shape for assessment and validation. */
export async function candidatePayload(link: Row): Promise<Intervention & { addressedProblem?: string }> {
  if (link.candidate_type === "analyst") {
    const ac = (await one("SELECT payload, addressed_problem FROM analyst_candidates WHERE id = $1", [link.candidate_id]))!;
    return { ...Intervention.parse({ ...ac.payload, action: ac.payload.description }), addressedProblem: ac.addressed_problem };
  }
  return Intervention.parse((await one("SELECT payload FROM interventions WHERE id = $1", [link.candidate_id]))!.payload);
}

export async function startAssessmentRun(job: AssessmentJob): Promise<{ eligible: string[] }> {
  try {
    await authorize(db(), job.requestedBy, "assessment.run", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  await db().query("UPDATE assessment_runs SET status = 'running' WHERE id = $1 AND project_id = $2", [job.assessmentRunId, job.projectId]);
  const links = await buildCandidateLinks(job.projectId, job.findingId);
  // Failed preconditions are recorded on the link and never sent to Jev.
  return { eligible: links.filter((l) => l.status === "eligible").map((l) => l.id) };
}

export async function attachBundle(job: AssessmentJob & { bundleId: string }): Promise<void> {
  await db().query("UPDATE assessment_runs SET evidence_bundle_id = $2 WHERE id = $1", [job.assessmentRunId, job.bundleId]);
}

const modelLabel = () => (process.env.JEV_MODE === "fixture" ? "fixture-decision@1" : `${process.env.JEV_MODEL ?? "jev-latest"}`);

/** Creates the assessment row, or returns the earlier final result with the same idempotency key. */
export async function createAssessment(job: AssessmentJob & { linkId: string; bundleId: string }): Promise<{ assessmentId: string; reused: boolean }> {
  const b = (await one("SELECT hash, context_limited, context_maybe_stale FROM evidence_bundles WHERE id = $1", [job.bundleId]))!;
  const link = (await one("SELECT * FROM candidate_links WHERE id = $1", [job.linkId]))!;
  const specs = await activeQuestionSpecs(job.projectId);
  const specVersion = specs.map((s) => `${s.task}@${s.version}`).join(",");
  const key = createHash("sha256").update(assessmentIdempotencyInput(b.hash, specVersion, modelLabel(), link.candidate_id)).digest("hex");
  const prior = await one("SELECT id FROM assessments WHERE project_id = $1 AND idempotency_key = $2 AND status <> 'failed' ORDER BY created_at LIMIT 1", [job.projectId, key]);
  if (prior) return { assessmentId: prior.id, reused: true };
  const pkg = (await one("SELECT rubric_id FROM context_packages WHERE id = $1", [link.context_package_id]))!;
  const rubric = pkg.rubric_id ? await one("SELECT id, version FROM rubrics WHERE id = $1", [pkg.rubric_id]) : undefined;
  const row = await one(
    `INSERT INTO assessments (project_id, assessment_run_id, finding_id, candidate_link_id, evidence_bundle_id, question_specs, rubric_id, rubric_version, adapter, idempotency_key, context_limited, context_maybe_stale)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [job.projectId, job.assessmentRunId, job.findingId, job.linkId, job.bundleId, JSON.stringify(specs.map((s) => ({ task: s.task, version: s.version }))), rubric?.id ?? null, rubric?.version ?? null,
      process.env.JEV_MODE === "fixture" ? "fixture" : "jev", key, b.context_limited, b.context_maybe_stale],
  );
  return { assessmentId: row!.id, reused: false };
}

async function recordUsage(projectId: string, runId: string, op: string, r: { requestId: string; model: string; modelVersion: string; latencyMs: number; cost: number | null }, raw: unknown, subjectId: string) {
  const key = `projects/${projectId}/model-output/jev/${runId}/${r.requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${op}.json`;
  await putJson(projectId, key, { operation: op, result: r, raw });
  await db().query(
    `INSERT INTO model_usage_events (project_id, kind, provider, model, model_version, request_id, operation, latency_ms, cost, raw_key, subject_id) VALUES ($1, 'jev', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [projectId, process.env.JEV_MODE === "fixture" ? "fixture" : "jev", r.model, r.modelVersion, r.requestId, op, Math.round(r.latencyMs), r.cost, key, subjectId],
  );
}

async function assertBudget(projectId: string) {
  const limit = Number(process.env.JEV_DAILY_BUDGET_CALLS ?? 500);
  const used = (await one("SELECT count(*)::int AS n FROM model_usage_events WHERE project_id = $1 AND kind = 'jev' AND created_at > date_trunc('day', now())", [projectId]))!.n;
  if (used >= limit) throw ApplicationFailure.nonRetryable(`Anggaran harian Jev proyek habis (${used}/${limit} panggilan)`, "BudgetExceeded");
}

/** Noul → Score per rubric criterion → Choice, then code aggregation and the uncertainty status. */
export async function runAssessment(job: AssessmentJob & { assessmentId: string }): Promise<string> {
  const a = (await one("SELECT * FROM assessments WHERE id = $1", [job.assessmentId]))!;
  if (["automatic", "needs_review", "insufficient_information", "failed"].includes(a.status)) return a.status;
  const adapter = decisionAdapter();
  const specs = Object.fromEntries((await activeQuestionSpecs(job.projectId)).map((s) => [s.task, s])) as Record<string, QuestionSpec>;
  const link = (await one("SELECT * FROM candidate_links WHERE id = $1", [a.candidate_link_id]))!;
  const cand = await candidatePayload(link);
  const f = (await one("SELECT * FROM findings WHERE id = $1", [a.finding_id]))!;
  const bundleRow = (await one("SELECT object_key FROM evidence_bundles WHERE id = $1", [a.evidence_bundle_id]))!;
  const bundle = EvidenceBundle.parse(await getJson(job.projectId, bundleRow.object_key));
  const context = {
    finding: { title: f.title, findingType: f.type, activities: findingActivities(f), summary: f.summary },
    candidate: { key: link.candidate_key, action: cand.action, findingTypes: cand.findingTypes, activities: cand.activities, addressedHypotheses: cand.addressedHypotheses, prerequisites: cand.prerequisites, successMetric: cand.successMetric },
    evidence: bundle.items.filter((i) => i.included).map((i) => ({ type: i.itemType, id: i.itemId, content: i.content })),
  };
  await db().query("UPDATE assessments SET status = 'running' WHERE id = $1", [a.id]);
  const idem = (op: string) => `${a.idempotency_key}:${op}`;

  try {
    await assertBudget(job.projectId);
    const suff = await adapter.noul({ question: specs.evidence_sufficiency!.question, context, idempotencyKey: idem("noul") });
    await recordUsage(job.projectId, a.assessment_run_id, "noul", suff.result, suff.raw, a.id);
    if (suff.result.probabilityYes < specs.evidence_sufficiency!.topThreshold) {
      await finish(a.id, { status: "insufficient_information", sufficiency: suff.result.probabilityYes, model: suff.result });
      return "insufficient_information";
    }

    const rubric = a.rubric_id ? (await one("SELECT payload FROM rubrics WHERE id = $1", [a.rubric_id]))!.payload : null;
    const criteria: { key: string; weight: number; score: number | null; scale: number[]; uncertain: boolean; dist: unknown; prob: number | null }[] = [];
    for (const c of rubric?.criteria ?? []) {
      await assertBudget(job.projectId);
      const scale = (c.scale as Row[]).map((s) => s.value as number);
      const r = await adapter.score({ question: `${specs.criterion_score!.question} Kriteria: ${c.name}.`, context: { ...context, criterion: c }, idempotencyKey: idem(`score:${c.key}`), scale });
      await recordUsage(job.projectId, a.assessment_run_id, `score:${c.key}`, r.result, r.raw, a.id);
      const u = uncertainty(r.result.distribution, specs.criterion_score!.topThreshold, specs.criterion_score!.marginThreshold);
      criteria.push({ key: c.key, weight: c.weight, score: scale.includes(r.result.score) ? r.result.score : null, scale, uncertain: u.uncertain, dist: r.result.distribution, prob: u.top });
    }

    await assertBudget(job.projectId);
    const rel = await adapter.choice({ question: specs.candidate_relevance!.question, context: { ...context, criteria: criteria.map((c) => ({ key: c.key, score: c.score })) }, idempotencyKey: idem("choice"), options: [...RELEVANCE_OPTIONS] });
    await recordUsage(job.projectId, a.assessment_run_id, "choice", rel.result, rel.raw, a.id);
    const top = [...rel.result.distribution].sort((x, y) => y.probability - x.probability)[0]!;
    const u = uncertainty(rel.result.distribution, specs.candidate_relevance!.topThreshold, specs.candidate_relevance!.marginThreshold);
    const agg = aggregateScore(criteria);
    const missing = rubric ? agg.missing : ["rubrik"];
    const status = top.option === "insufficient_information" ? "insufficient_information" : u.uncertain || missing.length || criteria.some((c) => c.uncertain) ? "needs_review" : "automatic";
    await withTx(db(), async (tx) => {
      for (const c of criteria) {
        const lo = Math.min(...c.scale), hi = Math.max(...c.scale);
        await tx.query(
          "INSERT INTO assessment_criterion_results (assessment_id, criterion_key, weight, score, normalized, probability, distribution) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
          [a.id, c.key, c.weight, c.score, c.score == null || hi === lo ? null : (c.score - lo) / (hi - lo), c.prob, JSON.stringify(c.dist)],
        );
      }
    });
    await finish(a.id, { status, sufficiency: suff.result.probabilityYes, conclusion: top.option, distribution: rel.result.distribution, top: u.top, margin: u.margin, total: agg.total, missing, model: rel.result });
    return status;
  } catch (err) {
    if (err instanceof ZodError) throw ApplicationFailure.retryable(`Respons model tidak sesuai skema: ${err.issues[0]?.message}`, "InvalidModelResponse");
    throw err;
  }
}

async function finish(id: string, r: { status: string; sufficiency?: number; conclusion?: string; distribution?: unknown; top?: number; margin?: number; total?: number | null; missing?: string[]; model: { model: string; modelVersion: string } }) {
  await db().query(
    `UPDATE assessments SET status = $2, sufficiency_probability = $3, conclusion = $4, distribution = $5, top_probability = $6, margin = $7, total_score = $8,
            missing_criteria = $9, model = $10, model_version = $11, completed_at = now() WHERE id = $1`,
    [id, r.status, r.sufficiency ?? null, r.conclusion ?? null, r.distribution ? JSON.stringify(r.distribution) : null, r.top ?? null, r.margin ?? null, r.total ?? null,
      JSON.stringify(r.missing ?? []), r.model.model, r.model.modelVersion],
  );
}

/** A real failure stays "failed"; it is never presented as insufficient information. */
export async function failAssessment(job: AssessmentJob & { assessmentId: string; message: string }): Promise<void> {
  await db().query("UPDATE assessments SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1 AND status IN ('queued', 'running')", [job.assessmentId, job.message.slice(0, 500)]);
}

export async function completeAssessmentRun(job: AssessmentJob & { error?: string }): Promise<void> {
  await db().query("UPDATE assessment_runs SET status = $2, error_message = $3, completed_at = now() WHERE id = $1", [job.assessmentRunId, job.error ? "failed" : "completed", job.error ?? null]);
  const n = (await one("SELECT count(*)::int AS n FROM assessments WHERE assessment_run_id = $1", [job.assessmentRunId]))!.n;
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "assessment.run", objectType: "assessment_run", objectId: job.assessmentRunId, result: job.error ? "failed" : "success", correlationId: job.correlationId, metadata: { findingId: job.findingId, assessments: n, error: job.error } });
}
