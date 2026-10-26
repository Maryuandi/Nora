import "server-only";
import { defaultPromptTemplate, InterpretationRequest, PromptTemplateBody, PromptTemplateInput, type Audience, type InterpretationTarget, type OfferedMetric, type Violation } from "@nora/contracts";
import { jsonAs, plain, type Prisma } from "@nora/db";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { can } from "./projects";

const UUID = /^[0-9a-f-]{36}$/i;
const IN_FLIGHT = ["queued", "generating", "checking", "repairing"];

/** The finding a target belongs to; null when the target is not in this project. */
async function targetFinding(projectId: string, targetType: InterpretationTarget, targetId: string): Promise<string | null> {
  const q = db();
  if (targetType === "finding") return (await q.finding.findFirst({ where: { id: targetId, projectId }, select: { id: true } }))?.id ?? null;
  if (targetType === "assessment") {
    return (await q.assessment.findFirst({ where: { id: targetId, projectId, status: { in: ["automatic", "needs_review", "insufficient_information"] } }, select: { findingId: true } }))?.findingId ?? null;
  }
  return (await q.candidateComparison.findFirst({ where: { id: targetId, projectId }, select: { findingId: true } }))?.findingId ?? null;
}

async function enqueue(viewer: Viewer, projectId: string, t: { targetType: string; targetId: string; findingId: string | null; audience: string; nonce: string | null; regeneratedFrom: string | null }, action: string, correlationId: string) {
  const id = await withTx(async (tx) => {
    const { id } = await tx.interpretation.create({ data: { projectId, ...t, requestedBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action, objectType: "interpretation", objectId: id, correlationId, metadata: { targetType: t.targetType, targetId: t.targetId, audience: t.audience, regeneratedFrom: t.regeneratedFrom } });
    return id;
  });
  await startJob("interpretationWorkflow", `interpretation-${id}`, [{ projectId, interpretationId: id, requestedBy: viewer.id, correlationId }]);
  return { id, status: "queued", reused: false };
}

/** 202-style request: the worker builds the bundle, calls the model and runs the checker. */
export async function requestInterpretation(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "interpretation.request", projectId);
  const parsed = InterpretationRequest.safeParse(raw);
  if (!parsed.success) throw badRequest("Permintaan interpretasi tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const r = parsed.data;
  const findingId = await targetFinding(projectId, r.targetType, r.targetId);
  if (!findingId) throw notFound();
  const running = await db().interpretation.findFirst({
    where: { projectId, targetId: r.targetId, audience: r.audience, status: { in: IN_FLIGHT } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true },
  });
  if (running) return { id: running.id, status: running.status, reused: true };
  return enqueue(viewer, projectId, { ...r, findingId, nonce: null, regeneratedFrom: null }, "interpretation.request", correlationId);
}

/** An explicit regenerate gets a new nonce, so it never reuses the earlier result. */
export async function regenerateInterpretation(viewer: Viewer, projectId: string, id: string, correlationId: string) {
  await can(viewer, "interpretation.request", projectId);
  const i = await row(projectId, id);
  if (IN_FLIGHT.includes(i.status)) throw conflict("Interpretasi masih diproses");
  return enqueue(viewer, projectId, { targetType: i.targetType, targetId: i.targetId, findingId: i.findingId, audience: i.audience, nonce: crypto.randomUUID(), regeneratedFrom: id }, "interpretation.regenerate", correlationId);
}

async function row(projectId: string, id: string) {
  if (!UUID.test(id)) throw notFound();
  const r = await db().interpretation.findFirst({ where: { id, projectId } });
  if (!r) throw notFound();
  return r;
}

/**
 * Superseded when the finding's data/context moved on, a comparison's candidates were validated again,
 * or a newer assessment of the same candidate exists. Raw: three correlated checks, one statement per page.
 */
async function staleIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db().$queryRaw<{ id: string }[]>`
    SELECT i.id FROM interpretations i WHERE i.id = ANY(${ids}::uuid[]) AND (
      EXISTS (SELECT 1 FROM findings f JOIN dataset_versions d ON d.id = f.dataset_version_id JOIN context_packages p ON p.id = f.context_package_id
               WHERE f.id = i.finding_id AND (d.status <> 'published' OR p.status <> 'active'))
      OR (i.target_type = 'candidate_comparison' AND EXISTS (SELECT 1 FROM candidate_comparisons c JOIN candidate_validations v ON v.candidate_link_id = ANY(c.candidate_link_ids)
               WHERE c.id = i.target_id AND v.created_at > c.created_at))
      OR (i.target_type = 'assessment' AND EXISTS (SELECT 1 FROM assessments a JOIN assessments b ON b.candidate_link_id = a.candidate_link_id AND b.created_at > a.created_at AND b.status <> 'failed'
               WHERE a.id = i.target_id)))`;
  return new Set(rows.map((r) => r.id));
}

const SUMMARY_SELECT = {
  id: true, targetType: true, targetId: true, findingId: true, audience: true, status: true, attempts: true, provider: true, model: true, modelVersion: true,
  templateVersion: true, checkerVersion: true, evidenceBundleId: true, reusedFrom: true, regeneratedFrom: true, inputTokens: true, outputTokens: true, cost: true,
  errorMessage: true, createdAt: true, completedAt: true, acceptedAt: true, flaggedAt: true, flagReason: true,
  acceptedByUser: { select: { name: true } }, flaggedByUser: { select: { name: true } },
} as const satisfies Prisma.InterpretationSelect;

const toSummary = ({ acceptedByUser, flaggedByUser, ...i }: Prisma.InterpretationGetPayload<{ select: typeof SUMMARY_SELECT }>, stale: Set<string>) => ({
  ...plain(i), targetType: i.targetType as InterpretationTarget, acceptedBy: acceptedByUser?.name ?? null, flaggedBy: flaggedByUser?.name ?? null, stale: stale.has(i.id),
});

export async function listInterpretations(viewer: Viewer, projectId: string, targetId: string) {
  await can(viewer, "project.read", projectId);
  if (!UUID.test(targetId)) throw badRequest("targetId wajib diisi");
  const rows = await db().interpretation.findMany({ where: { projectId, targetId }, orderBy: { createdAt: "desc" }, take: 50, select: SUMMARY_SELECT });
  const stale = await staleIds(rows.map((r) => r.id));
  const usage = await db().modelUsageEvent.aggregate({ where: { projectId, kind: "llm" }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, cost: true } });
  return {
    interpretations: rows.map((r) => toSummary(r, stale)),
    usage: { calls: usage._count._all, inputTokens: usage._sum.inputTokens ?? 0, outputTokens: usage._sum.outputTokens ?? 0, cost: usage._sum.cost },
  };
}

interface Citation { ref: string; itemType: string; itemId: string; itemVersion: string | null; contentRef: string | null }
interface Rendered { sections: { key: string }[]; assumptions: string[]; uncertainties: string[]; followUpQuestions: string[] }

/**
 * Draft, claims and checks. A draft that failed the checks returns only its violation summary;
 * the model text never reaches the page as a usable result.
 */
export async function getInterpretation(viewer: Viewer, projectId: string, id: string) {
  await can(viewer, "project.read", projectId);
  await row(projectId, id);
  const i = await db().interpretation.findUniqueOrThrow({ where: { id }, select: { ...SUMMARY_SELECT, rendered: true, offered: true, checkReport: true, parameters: true } });
  const usable = ["passed", "accepted", "flagged"].includes(i.status);
  const [claims, attempts, reports, versions, stale] = await Promise.all([
    usable ? db().interpretationClaim.findMany({
      where: { interpretationId: id }, orderBy: { ordinal: "asc" },
      select: { ordinal: true, sectionKey: true, claimType: true, text: true, citations: true, metrics: true, candidateId: true },
    }) : [],
    db().interpretationAttempt.findMany({
      where: { interpretationId: id }, orderBy: { attempt: "asc" },
      select: { attempt: true, model: true, finishReason: true, latencyMs: true, inputTokens: true, outputTokens: true, ok: true, createdAt: true },
    }),
    db().checkReport.findMany({ where: { interpretationId: id }, select: { attempt: true, violations: true } }),
    db().interpretationVersion.findMany({
      where: { interpretationId: id }, orderBy: { version: "asc" }, select: { version: true, kind: true, createdAt: true, content: true, createdByUser: { select: { name: true } } },
    }),
    staleIds([id]),
  ]);
  const { rendered, offered, checkReport, parameters, ...summary } = i;
  const content = usable ? jsonAs<Rendered | null>(rendered) : null;
  const shaped = claims.map(({ sectionKey, claimType, citations, metrics, ...c }) => ({
    ...c, section: sectionKey, type: claimType, citations: jsonAs<Citation[]>(citations), metrics: jsonAs<OfferedMetric[]>(metrics),
  }));
  return {
    ...toSummary(summary, stale),
    checkReport: jsonAs<{ ok: boolean; attempts: number; checkerVersion: string; violations: Violation[] } | null>(checkReport),
    parameters: jsonAs<Record<string, unknown> | null>(parameters),
    modelGenerated: i.status !== "accepted",
    assumptions: content?.assumptions ?? [], uncertainties: content?.uncertainties ?? [], followUpQuestions: content?.followUpQuestions ?? [],
    sections: content ? content.sections.map((s) => ({ key: s.key, claims: shaped.filter((c) => c.section === s.key) })) : [],
    validated: usable ? jsonAs<{ validated?: { id: string; action: string }[] } | null>(offered)?.validated ?? [] : [],
    attempts: attempts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), violations: jsonAs<Violation[]>(reports.find((r) => r.attempt === a.attempt)?.violations ?? []) })),
    versions: versions.map(({ content: v, createdByUser, ...x }) => ({
      ...x, createdAt: x.createdAt.toISOString(), createdBy: createdByUser?.name ?? null, note: jsonAs<{ note?: string | null }>(v).note ?? null,
    })),
  };
}

export async function acceptInterpretation(viewer: Viewer, projectId: string, id: string, note: string | null, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const i = await row(projectId, id);
  if (i.status !== "passed") throw conflict(i.status === "accepted" ? "Interpretasi sudah diterima" : "Hanya draft yang lolos pemeriksaan yang dapat diterima");
  const rendered = jsonAs<Prisma.InputJsonObject | null>(i.rendered);
  if (!rendered) throw conflict("Draft tidak memiliki isi");
  await withTx(async (tx) => {
    // The accepted summary is a new version; version 1 (the model draft) and the check report stay untouched.
    await tx.interpretationVersion.create({ data: { interpretationId: id, version: 2, kind: "accepted_summary", content: { ...rendered, note }, createdBy: viewer.id } });
    await tx.interpretation.update({ where: { id }, data: { status: "accepted", acceptedBy: viewer.id, acceptedAt: new Date() } });
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.accept", objectType: "interpretation", objectId: id, correlationId, metadata: { targetType: i.targetType, targetId: i.targetId, note } });
  });
  return { id, status: "accepted" };
}

export async function flagInterpretation(viewer: Viewer, projectId: string, id: string, reason: string, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const i = await row(projectId, id);
  if (!["passed", "accepted"].includes(i.status)) throw conflict("Hanya draft yang lolos pemeriksaan yang dapat ditandai");
  await withTx(async (tx) => {
    await tx.interpretation.update({ where: { id }, data: { status: "flagged", flaggedBy: viewer.id, flaggedAt: new Date(), flagReason: reason } });
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.flag", objectType: "interpretation", objectId: id, correlationId, metadata: { reason, previousStatus: i.status } });
  });
  return { id, status: "flagged" };
}

const TARGETS: InterpretationTarget[] = ["finding", "assessment", "candidate_comparison"];
const AUDIENCE_LIST: Audience[] = ["analyst", "process_owner"];

/** Active template per target × audience (the built-in default until a project version exists), plus history. */
export async function listPromptTemplates(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const rows = await db().promptTemplate.findMany({
    where: { projectId }, orderBy: [{ targetType: "asc" }, { audience: "asc" }, { version: "desc" }],
    select: { id: true, targetType: true, audience: true, version: true, body: true, status: true, createdAt: true },
  });
  const history = rows.map((r) => ({ ...r, id: r.id as string | null, body: jsonAs<PromptTemplateBody>(r.body), createdAt: r.createdAt.toISOString() as string | null }));
  const active = TARGETS.flatMap((t) => AUDIENCE_LIST.map((a) => history.find((r) => r.targetType === t && r.audience === a && r.status === "active")
    ?? { id: null, targetType: t, audience: a, version: 1, body: defaultPromptTemplate(t, a), status: "default", createdAt: null }));
  return { active, history };
}

export async function createPromptTemplate(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const parsed = PromptTemplateInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Template tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const t = parsed.data;
  return withTx(async (tx) => {
    // Version 1 is always the built-in default, so a project's first own template is version 2.
    const max = await tx.promptTemplate.aggregate({ where: { projectId, targetType: t.targetType, audience: t.audience }, _max: { version: true } });
    const current = max._max.version;
    if (current == null) {
      await tx.promptTemplate.create({ data: { projectId, targetType: t.targetType, audience: t.audience, version: 1, body: defaultPromptTemplate(t.targetType, t.audience), status: "superseded" } });
    }
    const version = (current ?? 1) + 1;
    await tx.promptTemplate.updateMany({ where: { projectId, targetType: t.targetType, audience: t.audience }, data: { status: "superseded" } });
    const { id } = await tx.promptTemplate.create({ data: { projectId, targetType: t.targetType, audience: t.audience, version, body: t.body, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.template", objectType: "prompt_template", objectId: id, correlationId, metadata: { targetType: t.targetType, audience: t.audience, version } });
    return { id, version };
  });
}
