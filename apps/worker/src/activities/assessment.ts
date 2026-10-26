import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { AuthzError } from "@nora/authz";
import { dbJson, jsonAs, toJson } from "@nora/db";
import { aggregateScore, assessmentIdempotencyInput, Condition, DEFAULT_QUESTION_SPECS, EvidenceBundle, Intervention, QuestionSpec, RELEVANCE_OPTIONS, uncertainty } from "@nora/contracts";
import { getJson, putJson } from "@nora/storage";
import { ZodError } from "zod";
import { decisionAdapter } from "../adapters/decision.ts";
import { conditionFacts, evaluateCondition, type ConditionResult, type FindingSubject } from "../conditions.ts";
import { audit, authorizeUser, db, startOfDay, withTx } from "../db.ts";

export interface AssessmentJob { projectId: string; findingId: string; assessmentRunId: string; requestedBy: string; correlationId: string }

/** Rubric payload as approved in the context package. */
interface Rubric { criteria: { key: string; name: string; weight: number; scale: { value: number; label: string; definition: string }[] }[] }

export async function activeQuestionSpecs(projectId: string): Promise<QuestionSpec[]> {
  // The built-in specs are seeded once per project; an existing version of the task is never touched.
  await db().questionSpec.createMany({
    data: DEFAULT_QUESTION_SPECS.map((s) => ({ projectId, task: s.task, primitive: s.primitive, version: s.version, spec: s })),
    skipDuplicates: true,
  });
  const rows = await db().questionSpec.findMany({ where: { projectId, status: "active" }, orderBy: { task: "asc" }, select: { spec: true } });
  return rows.map((r) => QuestionSpec.parse(r.spec));
}

function findingActivities(subject: FindingSubject): string[] {
  return [subject.from, subject.to, ...(subject.rules ?? []).flatMap((r) => [r.activity, r.from, r.to])].filter((a): a is string => !!a);
}

const preconditionStatus = (checks: { status: string }[]) =>
  checks.some((x) => x.status === "fail") ? "not_eligible" : checks.some((x) => x.status === "not_evaluable") ? "insufficient_information" : "eligible";

/**
 * Candidates are catalog interventions of the finding's context package that match it structurally
 * (finding type, activities). Conditions are checked here, deterministically, before any model call.
 */
export async function buildCandidateLinks(projectId: string, findingId: string): Promise<{ id: string; status: string }[]> {
  const f = await db().finding.findFirst({ where: { id: findingId, projectId }, select: { type: true, subject: true, contextPackageId: true } });
  if (!f) throw ApplicationFailure.nonRetryable("finding not found", "NotFound");
  const facts = await conditionFacts(findingId);
  const acts = findingActivities(jsonAs<FindingSubject>(f.subject));
  const link = (candidateId: string, create: { candidateType: string; candidateKey: string; candidateVersion: number; origin: string }, status: string, checks: unknown[]) =>
    db().candidateLink.upsert({
      where: { findingId_candidateId: { findingId, candidateId } },
      create: { projectId, findingId, contextPackageId: f.contextPackageId, candidateId, ...create, preconditionStatus: status, preconditionChecks: toJson(checks) },
      update: { preconditionStatus: status, preconditionChecks: toJson(checks) },
      select: { id: true },
    });
  const out: { id: string; status: string }[] = [];
  const refs = await db().contextPackageRef.findMany({ where: { packageId: f.contextPackageId, refType: "intervention" }, select: { refId: true } });
  for (const iv of await db().intervention.findMany({ where: { id: { in: refs.map((r) => r.refId) } }, orderBy: { itemKey: "asc" } })) {
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
    const status = preconditionStatus(checks);
    const row = await link(iv.id, { candidateType: "intervention", candidateKey: iv.itemKey, candidateVersion: iv.version, origin: "catalog" }, status, checks);
    out.push({ id: row.id, status });
  }
  // Analyst additions keep their origin; their conditions are re-checked on every refresh.
  for (const ac of await db().analystCandidate.findMany({ where: { projectId, findingId }, orderBy: { createdAt: "asc" } })) {
    const checks = (jsonAs<{ conditions?: unknown[] }>(ac.payload).conditions ?? []).map((cond) => evaluateCondition(Condition.parse(cond), facts));
    const status = preconditionStatus(checks);
    const row = await link(ac.id, { candidateType: "analyst", candidateKey: `analis-${ac.id.slice(0, 8)}`, candidateVersion: ac.version, origin: `analis: ${ac.sourceReason}` }, status, checks);
    out.push({ id: row.id, status });
  }
  return out;
}

/** Catalog interventions and analyst candidates share one shape for assessment and validation. */
export async function candidatePayload(link: { candidateType: string; candidateId: string }): Promise<Intervention & { addressedProblem?: string }> {
  if (link.candidateType === "analyst") {
    const ac = await db().analystCandidate.findUniqueOrThrow({ where: { id: link.candidateId }, select: { payload: true, addressedProblem: true } });
    const payload = jsonAs<Record<string, unknown>>(ac.payload);
    return { ...Intervention.parse({ ...payload, action: payload.description }), addressedProblem: ac.addressedProblem };
  }
  return Intervention.parse((await db().intervention.findUniqueOrThrow({ where: { id: link.candidateId }, select: { payload: true } })).payload);
}

export async function startAssessmentRun(job: AssessmentJob): Promise<{ eligible: string[] }> {
  try {
    await authorizeUser(job.requestedBy, "assessment.run", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  await db().assessmentRun.updateMany({ where: { id: job.assessmentRunId, projectId: job.projectId }, data: { status: "running" } });
  const links = await buildCandidateLinks(job.projectId, job.findingId);
  // Failed preconditions are recorded on the link and never sent to Jev.
  return { eligible: links.filter((l) => l.status === "eligible").map((l) => l.id) };
}

export async function attachBundle(job: AssessmentJob & { bundleId: string }): Promise<void> {
  await db().assessmentRun.updateMany({ where: { id: job.assessmentRunId }, data: { evidenceBundleId: job.bundleId } });
}

const modelLabel = () => (process.env.JEV_MODE === "fixture" ? "fixture-decision@1" : `${process.env.JEV_MODEL ?? "jev-latest"}`);

/** Creates the assessment row, or returns the earlier final result with the same idempotency key. */
export async function createAssessment(job: AssessmentJob & { linkId: string; bundleId: string }): Promise<{ assessmentId: string; reused: boolean }> {
  const b = await db().evidenceBundle.findUniqueOrThrow({ where: { id: job.bundleId }, select: { hash: true, contextLimited: true, contextMaybeStale: true } });
  const link = await db().candidateLink.findUniqueOrThrow({ where: { id: job.linkId }, select: { candidateId: true, contextPackage: { select: { rubricId: true } } } });
  const specs = await activeQuestionSpecs(job.projectId);
  const specVersion = specs.map((s) => `${s.task}@${s.version}`).join(",");
  const key = createHash("sha256").update(assessmentIdempotencyInput(b.hash, specVersion, modelLabel(), link.candidateId)).digest("hex");
  const prior = await db().assessment.findFirst({ where: { projectId: job.projectId, idempotencyKey: key, status: { not: "failed" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (prior) return { assessmentId: prior.id, reused: true };
  const rubricId = link.contextPackage.rubricId;
  const rubric = rubricId ? await db().rubric.findUnique({ where: { id: rubricId }, select: { id: true, version: true } }) : null;
  const { id } = await db().assessment.create({
    data: {
      projectId: job.projectId, assessmentRunId: job.assessmentRunId, findingId: job.findingId, candidateLinkId: job.linkId, evidenceBundleId: job.bundleId,
      questionSpecs: specs.map((s) => ({ task: s.task, version: s.version })), rubricId: rubric?.id ?? null, rubricVersion: rubric?.version ?? null,
      adapter: process.env.JEV_MODE === "fixture" ? "fixture" : "jev", idempotencyKey: key, contextLimited: b.contextLimited, contextMaybeStale: b.contextMaybeStale,
    },
    select: { id: true },
  });
  return { assessmentId: id, reused: false };
}

async function recordUsage(projectId: string, runId: string, op: string, r: { requestId: string; model: string; modelVersion: string; latencyMs: number; cost: number | null }, raw: unknown, subjectId: string) {
  const key = `projects/${projectId}/model-output/jev/${runId}/${r.requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${op}.json`;
  await putJson(projectId, key, { operation: op, result: r, raw });
  await db().modelUsageEvent.create({
    data: {
      projectId, kind: "jev", provider: process.env.JEV_MODE === "fixture" ? "fixture" : "jev", model: r.model, modelVersion: r.modelVersion, requestId: r.requestId,
      operation: op, latencyMs: Math.round(r.latencyMs), cost: r.cost, rawKey: key, subjectId,
    },
  });
}

async function assertBudget(projectId: string) {
  const limit = Number(process.env.JEV_DAILY_BUDGET_CALLS ?? 500);
  const used = await db().modelUsageEvent.count({ where: { projectId, kind: "jev", createdAt: { gt: startOfDay() } } });
  if (used >= limit) throw ApplicationFailure.nonRetryable(`Anggaran harian Jev proyek habis (${used}/${limit} panggilan)`, "BudgetExceeded");
}

/** Noul → Score per rubric criterion → Choice, then code aggregation and the uncertainty status. */
export async function runAssessment(job: AssessmentJob & { assessmentId: string }): Promise<string> {
  const a = await db().assessment.findUniqueOrThrow({ where: { id: job.assessmentId } });
  if (["automatic", "needs_review", "insufficient_information", "failed"].includes(a.status)) return a.status;
  const adapter = decisionAdapter();
  const specs = Object.fromEntries((await activeQuestionSpecs(job.projectId)).map((s) => [s.task, s])) as Record<string, QuestionSpec>;
  const link = await db().candidateLink.findUniqueOrThrow({ where: { id: a.candidateLinkId }, select: { candidateKey: true, candidateType: true, candidateId: true } });
  const cand = await candidatePayload(link);
  const f = await db().finding.findUniqueOrThrow({ where: { id: a.findingId }, select: { title: true, type: true, summary: true, subject: true } });
  const bundleRow = await db().evidenceBundle.findUniqueOrThrow({ where: { id: a.evidenceBundleId! }, select: { objectKey: true } });
  const bundle = EvidenceBundle.parse(await getJson(job.projectId, bundleRow.objectKey));
  const context = {
    finding: { title: f.title, findingType: f.type, activities: findingActivities(jsonAs<FindingSubject>(f.subject)), summary: f.summary },
    candidate: { key: link.candidateKey, action: cand.action, findingTypes: cand.findingTypes, activities: cand.activities, addressedHypotheses: cand.addressedHypotheses, prerequisites: cand.prerequisites, successMetric: cand.successMetric },
    evidence: bundle.items.filter((i) => i.included).map((i) => ({ type: i.itemType, id: i.itemId, content: i.content })),
  };
  await db().assessment.update({ where: { id: a.id }, data: { status: "running" } });
  const idem = (op: string) => `${a.idempotencyKey}:${op}`;

  try {
    await assertBudget(job.projectId);
    const suff = await adapter.noul({ question: specs.evidence_sufficiency!.question, context, idempotencyKey: idem("noul") });
    await recordUsage(job.projectId, a.assessmentRunId, "noul", suff.result, suff.raw, a.id);
    if (suff.result.probabilityYes < specs.evidence_sufficiency!.topThreshold) {
      await finish(a.id, { status: "insufficient_information", sufficiency: suff.result.probabilityYes, model: suff.result });
      return "insufficient_information";
    }

    const rubric = a.rubricId ? jsonAs<Rubric>((await db().rubric.findUniqueOrThrow({ where: { id: a.rubricId }, select: { payload: true } })).payload) : null;
    const criteria: { key: string; weight: number; score: number | null; scale: number[]; uncertain: boolean; dist: unknown; prob: number | null }[] = [];
    for (const c of rubric?.criteria ?? []) {
      await assertBudget(job.projectId);
      const scale = c.scale.map((s) => s.value);
      const r = await adapter.score({ question: `${specs.criterion_score!.question} Kriteria: ${c.name}.`, context: { ...context, criterion: c }, idempotencyKey: idem(`score:${c.key}`), scale });
      await recordUsage(job.projectId, a.assessmentRunId, `score:${c.key}`, r.result, r.raw, a.id);
      const u = uncertainty(r.result.distribution, specs.criterion_score!.topThreshold, specs.criterion_score!.marginThreshold);
      criteria.push({ key: c.key, weight: c.weight, score: scale.includes(r.result.score) ? r.result.score : null, scale, uncertain: u.uncertain, dist: r.result.distribution, prob: u.top });
    }

    await assertBudget(job.projectId);
    const rel = await adapter.choice({ question: specs.candidate_relevance!.question, context: { ...context, criteria: criteria.map((c) => ({ key: c.key, score: c.score })) }, idempotencyKey: idem("choice"), options: [...RELEVANCE_OPTIONS] });
    await recordUsage(job.projectId, a.assessmentRunId, "choice", rel.result, rel.raw, a.id);
    const top = [...rel.result.distribution].sort((x, y) => y.probability - x.probability)[0]!;
    const u = uncertainty(rel.result.distribution, specs.candidate_relevance!.topThreshold, specs.candidate_relevance!.marginThreshold);
    const agg = aggregateScore(criteria);
    const missing = rubric ? agg.missing : ["rubrik"];
    const status = top.option === "insufficient_information" ? "insufficient_information" : u.uncertain || missing.length || criteria.some((c) => c.uncertain) ? "needs_review" : "automatic";
    await db().assessmentCriterionResult.createMany({
      data: criteria.map((c) => {
        const lo = Math.min(...c.scale), hi = Math.max(...c.scale);
        return { assessmentId: a.id, criterionKey: c.key, weight: c.weight, score: c.score, normalized: c.score == null || hi === lo ? null : (c.score - lo) / (hi - lo), probability: c.prob, distribution: dbJson(c.dist) };
      }),
      skipDuplicates: true,
    });
    await finish(a.id, { status, sufficiency: suff.result.probabilityYes, conclusion: top.option, distribution: rel.result.distribution, top: u.top, margin: u.margin, total: agg.total, missing, model: rel.result });
    return status;
  } catch (err) {
    if (err instanceof ZodError) throw ApplicationFailure.retryable(`Respons model tidak sesuai skema: ${err.issues[0]?.message}`, "InvalidModelResponse");
    throw err;
  }
}

async function finish(id: string, r: { status: string; sufficiency?: number; conclusion?: string; distribution?: unknown; top?: number; margin?: number; total?: number | null; missing?: string[]; model: { model: string; modelVersion: string } }) {
  await db().assessment.update({
    where: { id },
    data: {
      status: r.status, sufficiencyProbability: r.sufficiency ?? null, conclusion: r.conclusion ?? null, distribution: dbJson(r.distribution), topProbability: r.top ?? null,
      margin: r.margin ?? null, totalScore: r.total ?? null, missingCriteria: r.missing ?? [], model: r.model.model, modelVersion: r.model.modelVersion, completedAt: new Date(),
    },
  });
}

/** A real failure stays "failed"; it is never presented as insufficient information. */
export async function failAssessment(job: AssessmentJob & { assessmentId: string; message: string }): Promise<void> {
  await db().assessment.updateMany({
    where: { id: job.assessmentId, status: { in: ["queued", "running"] } }, data: { status: "failed", errorMessage: job.message.slice(0, 500), completedAt: new Date() },
  });
}

export async function completeAssessmentRun(job: AssessmentJob & { error?: string }): Promise<void> {
  await db().assessmentRun.updateMany({ where: { id: job.assessmentRunId }, data: { status: job.error ? "failed" : "completed", errorMessage: job.error ?? null, completedAt: new Date() } });
  const n = await db().assessment.count({ where: { assessmentRunId: job.assessmentRunId } });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "assessment.run", objectType: "assessment_run", objectId: job.assessmentRunId, result: job.error ? "failed" : "success", correlationId: job.correlationId, metadata: { findingId: job.findingId, assessments: n, error: job.error } });
}
