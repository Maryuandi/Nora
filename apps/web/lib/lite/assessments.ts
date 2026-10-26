import "server-only";
import { QuestionSpec, RELEVANCE_OPTIONS, type Condition } from "@nora/contracts";
import { jsonAs, plain, type Prisma } from "@nora/db";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { can } from "./projects";

export async function requestAssessmentRun(viewer: Viewer, projectId: string, findingId: string, correlationId: string, trigger: "manual" | "recommendation_refresh" = "manual") {
  await can(viewer, "assessment.run", projectId);
  if (!(await db().finding.findFirst({ where: { id: findingId, projectId }, select: { id: true } }))) throw notFound();
  const running = await db().assessmentRun.findFirst({ where: { findingId, status: { in: ["queued", "running"] } }, select: { id: true } });
  if (running) return { id: running.id, reused: true };
  const id = await withTx(async (tx) => {
    const { id } = await tx.assessmentRun.create({ data: { projectId, findingId, trigger, requestedBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.request", objectType: "assessment_run", objectId: id, correlationId, metadata: { findingId, trigger } });
    return id;
  });
  await startJob("assessmentWorkflow", `assessment-${id}`, [{ projectId, findingId, assessmentRunId: id, requestedBy: viewer.id, correlationId }]);
  return { id, reused: false };
}

/** A stored precondition result of a candidate link, as the worker evaluated it. */
export interface PreconditionCheck { condition: Condition; status: string; actual: unknown; reason: string }

export interface AssessmentView {
  id: string;
  status: string;
  candidateLinkId: string;
  candidateKey: string;
  candidateVersion: number;
  candidateAction: string | null;
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

const VIEW_SELECT = {
  id: true, status: true, candidateLinkId: true, conclusion: true, distribution: true, topProbability: true, margin: true, sufficiencyProbability: true, totalScore: true,
  missingCriteria: true, adapter: true, model: true, modelVersion: true, questionSpecs: true, rubricVersion: true, evidenceBundleId: true, contextLimited: true,
  contextMaybeStale: true, errorMessage: true, createdAt: true, findingId: true,
  candidateLink: { select: { candidateKey: true, candidateVersion: true, candidateId: true } },
  assessmentCriterionResults: { orderBy: { criterionKey: "asc" }, select: { criterionKey: true, weight: true, score: true, normalized: true, probability: true } },
  assessmentCorrections: {
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, conclusion: true, reason: true, goldCandidate: true, createdAt: true, createdByUser: { select: { name: true } } },
  },
} as const satisfies Prisma.AssessmentSelect;

type AssessmentRecord = Prisma.AssessmentGetPayload<{ select: typeof VIEW_SELECT }>;

/** Catalog actions by intervention id (analyst candidates have none). */
async function interventionActions(ids: string[]): Promise<Map<string, string | null>> {
  const rows = await db().intervention.findMany({ where: { id: { in: ids } }, select: { id: true, payload: true } });
  return new Map(rows.map((i) => [i.id, jsonAs<{ action?: string } | null>(i.payload)?.action ?? null]));
}

/** Assessments asked with a question-spec version that has since been superseded. */
async function supersededSpecs(projectId: string): Promise<Set<string>> {
  const rows = await db().questionSpec.findMany({ where: { projectId, status: "superseded" }, select: { task: true, version: true } });
  return new Set(rows.map((s) => `${s.task}@${s.version}`));
}

function toView(a: AssessmentRecord, actions: Map<string, string | null>, superseded: Set<string>): AssessmentView {
  const { candidateLink: l, assessmentCriterionResults, assessmentCorrections, findingId: _, ...rest } = a;
  const questionSpecs = jsonAs<AssessmentView["questionSpecs"]>(a.questionSpecs);
  const view = {
    ...rest, candidateKey: l.candidateKey, candidateVersion: l.candidateVersion, candidateAction: actions.get(l.candidateId) ?? null,
    distribution: jsonAs<AssessmentView["distribution"]>(a.distribution), missingCriteria: jsonAs<string[]>(a.missingCriteria), questionSpecs,
    createdAt: a.createdAt.toISOString(),
    criteria: assessmentCriterionResults.map(({ criterionKey, ...c }) => ({ key: criterionKey, ...c })),
    corrections: assessmentCorrections.map(({ createdByUser, ...c }) => ({ ...c, createdAt: c.createdAt.toISOString(), by: createdByUser?.name ?? null })),
    specSuperseded: questionSpecs.some((s) => superseded.has(`${s.task}@${s.version}`)),
  };
  const corr = [...view.corrections].reverse().find((c) => c.kind === "correct");
  if (corr) return { ...view, effective: { conclusion: corr.conclusion, source: "correction" } };
  if (view.corrections.some((c) => c.kind === "confirm")) return { ...view, effective: { conclusion: view.conclusion, source: "confirmation" } };
  return { ...view, effective: { conclusion: view.conclusion, source: "model" } };
}

/** Latest assessment per candidate for a finding, plus candidates stopped by preconditions (never sent to Jev). */
export async function findingAssessments(viewer: Viewer, projectId: string, findingId: string) {
  await can(viewer, "project.read", projectId);
  const [rows, blockedLinks, run, superseded] = await Promise.all([
    db().assessment.findMany({ where: { projectId, findingId }, orderBy: [{ candidateLinkId: "asc" }, { createdAt: "desc" }], distinct: ["candidateLinkId"], select: VIEW_SELECT }),
    db().candidateLink.findMany({
      where: { projectId, findingId, preconditionStatus: { not: "eligible" } }, orderBy: { candidateKey: "asc" },
      select: { id: true, candidateKey: true, candidateId: true, preconditionStatus: true, preconditionChecks: true },
    }),
    db().assessmentRun.findFirst({
      where: { projectId, findingId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, errorMessage: true, createdAt: true, completedAt: true },
    }),
    supersededSpecs(projectId),
  ]);
  const actions = await interventionActions([...rows.map((a) => a.candidateLink.candidateId), ...blockedLinks.map((l) => l.candidateId)]);
  const latest = rows.map((a) => toView(a, actions, superseded));
  const blocked = blockedLinks.map((l) => ({
    id: l.id, candidateKey: l.candidateKey, candidateAction: actions.get(l.candidateId) ?? null, preconditionStatus: l.preconditionStatus,
    checks: jsonAs<PreconditionCheck[]>(l.preconditionChecks),
  }));
  return { assessments: latest.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1)), blocked, run: run && plain(run) };
}

export async function getAssessment(viewer: Viewer, projectId: string, id: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const row = await db().assessment.findFirst({ where: { id, projectId }, select: VIEW_SELECT });
  if (!row) throw notFound();
  const [actions, superseded, usage] = await Promise.all([
    interventionActions([row.candidateLink.candidateId]),
    supersededSpecs(projectId),
    db().modelUsageEvent.findMany({
      where: { subjectId: id }, orderBy: { id: "asc" },
      select: { operation: true, provider: true, model: true, modelVersion: true, requestId: true, latencyMs: true, cost: true, rawKey: true, createdAt: true },
    }),
  ]);
  return { ...toView(row, actions, superseded), findingId: row.findingId, usage: usage.map(plain) };
}

/** Correction never overwrites the model output; it is stored next to it and needs a reason. */
export async function correctAssessment(viewer: Viewer, projectId: string, id: string, input: { kind: "confirm" | "correct"; conclusion?: string | null; reason: string; goldCandidate?: boolean }, correlationId: string) {
  await can(viewer, "assessment.correct", projectId);
  if (input.kind === "correct" && !(RELEVANCE_OPTIONS as readonly string[]).includes(input.conclusion ?? "")) throw badRequest("Kesimpulan koreksi tidak valid", { conclusion: "Pilih kesimpulan" });
  if (!input.reason.trim()) throw badRequest("Alasan wajib diisi", { reason: "Alasan wajib diisi" });
  return withTx(async (tx) => {
    const a = await tx.assessment.findFirst({ where: { id, projectId }, select: { status: true, conclusion: true } });
    if (!a) throw notFound();
    if (!["needs_review", "automatic", "insufficient_information"].includes(a.status)) throw conflict(`Penilaian berstatus ${a.status} tidak dapat dikonfirmasi atau dikoreksi`);
    const conclusion = input.kind === "correct" ? input.conclusion ?? null : a.conclusion;
    const correction = await tx.assessmentCorrection.create({
      data: { projectId, assessmentId: id, kind: input.kind, conclusion, reason: input.reason.trim(), goldCandidate: !!input.goldCandidate, createdBy: viewer.id },
      select: { id: true },
    });
    if (input.goldCandidate) {
      if (!conclusion) throw badRequest("Gold set membutuhkan kesimpulan", { conclusion: "Pilih kesimpulan" });
      await tx.goldSetItem.upsert({
        where: { assessmentId: id },
        create: { projectId, assessmentId: id, correctionId: correction.id, label: conclusion },
        update: { correctionId: correction.id, label: conclusion },
      });
    }
    await audit(tx, { projectId, actorId: viewer.id, action: `assessment.${input.kind}`, objectType: "assessment", objectId: id, correlationId, metadata: { from: a.conclusion, to: input.conclusion ?? a.conclusion, gold: !!input.goldCandidate } });
    return { id: correction.id };
  });
}

export async function listSpecs(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().questionSpec.findMany({
    where: { projectId }, orderBy: [{ task: "asc" }, { version: "desc" }], select: { id: true, task: true, primitive: true, version: true, spec: true, status: true, createdAt: true },
  });
  return rows.map((s) => ({ ...s, spec: jsonAs<QuestionSpec>(s.spec), createdAt: s.createdAt.toISOString() }));
}

/** New spec version: the old one is superseded; results keep the version they were asked with. */
export async function createSpec(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "assessment.run", projectId);
  const parsed = QuestionSpec.omit({ version: true }).safeParse(raw);
  if (!parsed.success) throw badRequest("Spesifikasi tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const spec = parsed.data;
  return withTx(async (tx) => {
    const max = await tx.questionSpec.aggregate({ where: { projectId, task: spec.task }, _max: { version: true } });
    const v = (max._max.version ?? 0) + 1;
    await tx.questionSpec.updateMany({ where: { projectId, task: spec.task, status: "active" }, data: { status: "superseded" } });
    const { id } = await tx.questionSpec.create({ data: { projectId, task: spec.task, primitive: spec.primitive, version: v, spec: { ...spec, version: v }, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.spec", objectType: "question_spec", objectId: id, correlationId, metadata: { task: spec.task, version: v, topThreshold: spec.topThreshold, marginThreshold: spec.marginThreshold } });
    return { id, version: v };
  });
}

/** Gold set and a simple evaluation: accuracy of the model conclusion and Brier score of its probabilities. */
export async function goldSet(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const [items, runs] = await Promise.all([
    db().goldSetItem.findMany({
      where: { projectId }, orderBy: { createdAt: "desc" },
      select: { id: true, label: true, createdAt: true, assessment: { select: { conclusion: true, distribution: true, candidateLink: { select: { candidateKey: true } } } } },
    }),
    db().evaluationRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, metrics: true, createdAt: true } }),
  ]);
  return {
    items: items.map(({ assessment: a, ...g }) => ({
      id: g.id, label: g.label, modelConclusion: a.conclusion, distribution: jsonAs<{ option: string; probability: number }[] | null>(a.distribution),
      candidateKey: a.candidateLink.candidateKey, createdAt: g.createdAt.toISOString(),
    })),
    runs: runs.map((r) => ({ id: r.id, metrics: jsonAs<{ items: number; accuracy: number; brierScore: number }>(r.metrics), createdAt: r.createdAt.toISOString() })),
  };
}

export async function evaluateGoldSet(viewer: Viewer, projectId: string, correlationId: string) {
  await can(viewer, "assessment.run", projectId);
  const { items } = await goldSet(viewer, projectId);
  if (!items.length) throw conflict("Gold set masih kosong");
  const correct = items.filter((i) => i.modelConclusion === i.label).length;
  const brier = items.reduce((s, i) => s + (i.distribution ?? []).reduce((t, d) => t + (d.probability - (d.option === i.label ? 1 : 0)) ** 2, 0), 0) / items.length;
  const metrics = { items: items.length, accuracy: correct / items.length, brierScore: brier };
  return withTx(async (tx) => {
    const { id } = await tx.evaluationRun.create({ data: { projectId, metrics, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "assessment.evaluate", objectType: "evaluation_run", objectId: id, correlationId, metadata: metrics });
    return { id, metrics };
  });
}
