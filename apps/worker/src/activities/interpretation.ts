import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { AuthzError } from "@nora/authz";
import { dbJson, jsonAs, toJson } from "@nora/db";
import {
  CHECKER_VERSION, checkInterpretation, defaultPromptTemplate, EvidenceBundle, formatMetric, interpretationKeyInput, PromptTemplateBody, renderClaims,
  type Audience, type CheckContext, type InterpretationTarget, type OfferedItem, type OfferedMetric, type Violation,
} from "@nora/contracts";
import type { NodeRef } from "@nora/graph";
import { getJson, putJson } from "@nora/storage";
import { llmAdapter, llmModelLabel } from "../adapters/llm.ts";
import { audit, authorizeUser, db, startOfDay, withTx } from "../db.ts";
import { findingCandidates, registerEvidenceSource, type Candidate } from "./evidence.ts";
import { registerGraphHandler } from "./graph.ts";

export interface InterpretationJob { projectId: string; interpretationId: string; requestedBy: string; correlationId: string }

export const MAX_ATTEMPTS = 3;

// ---------- Evidence sources for the two non-finding targets ----------

const shift = (items: Candidate[], by: number) => items.map((c) => ({ ...c, priority: Math.min(9, c.priority + by) }));

/** One compared candidate, as the comparison snapshot stores it. */
interface ComparedCandidate {
  linkId: string; validationId: string | null; action: string | null; candidateKey: string; origin: string; status: string | null; stale: boolean | null;
  rows: {
    addressedProblem: { value: unknown }; relevance: { value: unknown; score: number | null; source: string | null }; prerequisites: { value: unknown }; owner: { value: unknown };
    exclusions: { value: unknown }; missingInformation: { value: unknown }; successMetric: { value: unknown };
    magnitude: { value: unknown; source: string | null }; evidenceConfidence: { value: unknown; source: string | null }; effort: { value: unknown; source: string | null };
    risk: { value: unknown; source: string | null }; priority: { value: unknown; rank: number | null; partial: boolean | null; source: string | null };
  };
}

/** A stored comparison snapshot: each candidate's values exactly as compared, then the finding's own evidence. */
async function comparisonCandidates(projectId: string, comparisonId: string, purpose: string): Promise<Candidate[]> {
  const c = await db().candidateComparison.findFirst({ where: { id: comparisonId, projectId }, select: { findingId: true, payload: true } });
  if (!c) throw ApplicationFailure.nonRetryable("comparison not found in project", "NotFound");
  const C = { type: "Comparison", id: comparisonId };
  const out: Candidate[] = [];
  for (const k of jsonAs<{ candidates: ComparedCandidate[] }>(c.payload).candidates) {
    const r = k.rows;
    out.push({
      itemType: "comparison_candidate", itemId: k.linkId, itemVersion: k.validationId, priority: 1, graphRef: C,
      content: { action: k.action, candidateKey: k.candidateKey, origin: k.origin, validationStatus: k.status, stale: k.stale, addressedProblem: r.addressedProblem.value,
        relevance: r.relevance.value, prerequisites: r.prerequisites.value, owner: r.owner.value, exclusions: r.exclusions.value, missingInformation: r.missingInformation.value,
        successMetric: r.successMetric.value, rank: r.priority.rank ?? null, partialScore: r.priority.partial ?? null },
    });
    const metric = (name: string, value: unknown, unit: string, source: string | null) => {
      if (typeof value !== "number") return;
      out.push({ itemType: "metric_value", itemId: `${k.linkId}:${name}`, itemVersion: source, priority: 1, graphRef: C, content: { metric: name, value, unit, candidate: k.action, source } });
    };
    metric("problemMagnitude", r.magnitude.value, "ratio", r.magnitude.source);
    metric("relevanceRubricScore", r.relevance.score, "number", r.relevance.source);
    metric("evidenceConfidence", r.evidenceConfidence.value, "number", r.evidenceConfidence.source);
    metric("effort", r.effort.value, "number", r.effort.source);
    metric("risk", r.risk.value, "number", r.risk.source);
    metric("priorityScore", r.priority.value, "number", r.priority.source);
  }
  return [...out, ...shift(await findingCandidates(projectId, c.findingId, purpose), 1)];
}

/** One Jev assessment summary: conclusion, probabilities, criterion scores, then the finding's evidence. */
async function assessmentCandidates(projectId: string, assessmentId: string, purpose: string): Promise<Candidate[]> {
  const a = await db().assessment.findFirst({
    where: { id: assessmentId, projectId },
    include: {
      candidateLink: { select: { candidateKey: true, candidateType: true, candidateId: true } },
      assessmentCorrections: { orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, conclusion: true } },
      assessmentCriterionResults: { orderBy: { criterionKey: "asc" }, select: { criterionKey: true, score: true } },
    },
  });
  if (!a) throw ApplicationFailure.nonRetryable("assessment not found in project", "NotFound");
  const A = { type: "Assessment", id: assessmentId };
  const l = a.candidateLink;
  const action = l.candidateType === "analyst"
    ? jsonAs<{ description?: string }>((await db().analystCandidate.findUnique({ where: { id: l.candidateId }, select: { payload: true } }))?.payload ?? {}).description
    : jsonAs<{ action?: string }>((await db().intervention.findUnique({ where: { id: l.candidateId }, select: { payload: true } }))?.payload ?? {}).action;
  const corr = a.assessmentCorrections[0];
  const out: Candidate[] = [{
    itemType: "assessment_result", itemId: assessmentId, itemVersion: a.modelVersion, priority: 1, graphRef: A,
    content: { candidateKey: l.candidateKey, candidateAction: action, status: a.status, conclusion: a.conclusion, humanReview: corr ? { kind: corr.kind, conclusion: corr.conclusion } : null,
      missingCriteria: a.missingCriteria, contextLimited: a.contextLimited, model: a.model },
  }];
  const metric = (name: string, value: unknown, unit: string) => {
    if (typeof value === "number") out.push({ itemType: "metric_value", itemId: `${assessmentId}:${name}`, itemVersion: a.modelVersion, priority: 1, graphRef: A, content: { metric: name, value, unit } });
  };
  metric("sufficiencyProbability", a.sufficiencyProbability, "ratio");
  metric("topProbability", a.topProbability, "ratio");
  metric("margin", a.margin, "ratio");
  metric("totalScore", a.totalScore, "number");
  for (const c of a.assessmentCriterionResults) metric(`criterion:${c.criterionKey}`, c.score, "number");
  return [...out, ...shift(await findingCandidates(projectId, a.findingId, purpose), 1)];
}

registerEvidenceSource("candidate_comparison", (p, t, purpose) => comparisonCandidates(p, t, purpose));
registerEvidenceSource("assessment", (p, t, purpose) => assessmentCandidates(p, t, purpose));

// ---------- Graph projection of comparisons and interpretations ----------

const ref = (type: NodeRef["type"], id: string): NodeRef => ({ type, id });
const TARGET_NODE: Record<string, NodeRef["type"]> = { finding: "Finding", assessment: "Assessment", candidate_comparison: "Comparison" };

registerGraphHandler("candidate_comparisons", async (w, id) => {
  const c = await db().candidateComparison.findUnique({ where: { id } });
  if (!c) return;
  const m = { creatorType: "human", recordId: id, at: c.createdAt };
  await w.node(ref("Comparison", id), `Perbandingan ${c.candidateLinkIds.length} kandidat`, { candidates: c.candidateLinkIds.length });
  await w.rel("DERIVED_FROM", ref("Comparison", id), ref("Finding", c.findingId), m);
  for (const b of c.bundleIds) await w.rel("CITES", ref("Comparison", id), ref("EvidenceBundle", b), m);
});

registerGraphHandler("interpretations", async (w, id) => {
  const i = await db().interpretation.findUnique({ where: { id } });
  if (!i || !["passed", "accepted", "flagged"].includes(i.status)) return;
  const target = TARGET_NODE[i.targetType]!;
  const m = { creatorType: "model", recordId: id, at: i.completedAt, version: i.modelVersion, status: i.status };
  await w.node(ref("Interpretation", id), `Interpretasi (${i.audience})`, { status: i.status, audience: i.audience, model: i.model, checker: i.checkerVersion });
  await w.rel("DERIVED_FROM", ref("Interpretation", id), ref(target, i.targetId), m);
  if (i.evidenceBundleId) await w.rel("CITES", ref("Interpretation", id), ref("EvidenceBundle", i.evidenceBundleId), m);
  if (i.status === "accepted" || i.status === "flagged") {
    await w.rel("REVIEWED", ref("Interpretation", id), ref(target, i.targetId), { creatorType: "human", recordId: id, at: i.acceptedAt ?? i.flaggedAt, status: i.status });
  }
});

// ---------- Workflow activities ----------

export async function startInterpretation(job: InterpretationJob): Promise<{ targetType: InterpretationTarget; targetId: string }> {
  try {
    await authorizeUser(job.requestedBy, "interpretation.request", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  const i = await db().interpretation.findFirst({ where: { id: job.interpretationId, projectId: job.projectId }, select: { targetType: true, targetId: true } });
  if (!i) throw ApplicationFailure.nonRetryable("interpretation not found", "NotFound");
  // target_type is CHECK-constrained to the three interpretation targets.
  return { targetType: i.targetType as InterpretationTarget, targetId: i.targetId };
}

export async function activeTemplate(projectId: string, targetType: string, audience: string): Promise<{ id: string; version: number; body: PromptTemplateBody }> {
  // Version 1 is the built-in default, seeded once per target × audience.
  await db().promptTemplate.createMany({
    data: [{ projectId, targetType, audience, version: 1, body: defaultPromptTemplate(targetType as InterpretationTarget, audience as Audience) }],
    skipDuplicates: true,
  });
  const t = await db().promptTemplate.findFirstOrThrow({ where: { projectId, targetType, audience, status: "active" }, orderBy: { version: "desc" }, select: { id: true, version: true, body: true } });
  return { id: t.id, version: t.version, body: PromptTemplateBody.parse(t.body) };
}

/** Fixes the bundle, template and model for this request; a passed result with the same key is reused instead of calling the model. */
export async function prepareInterpretation(job: InterpretationJob & { bundleId: string }): Promise<{ reused: boolean }> {
  const i = await db().interpretation.findUniqueOrThrow({ where: { id: job.interpretationId } });
  const b = await db().evidenceBundle.findUniqueOrThrow({ where: { id: job.bundleId }, select: { hash: true } });
  const t = await activeTemplate(job.projectId, i.targetType, i.audience);
  const model = llmModelLabel();
  const key = createHash("sha256").update(interpretationKeyInput(b.hash, `${i.targetType}/${i.audience}@${t.version}`, model, i.audience, i.nonce)).digest("hex");
  await db().interpretation.update({
    where: { id: i.id }, data: { evidenceBundleId: job.bundleId, promptTemplateId: t.id, templateVersion: t.version, checkerVersion: CHECKER_VERSION, interpretationKey: key, model },
  });
  if (i.nonce) return { reused: false };
  const prior = await db().interpretation.findFirst({
    where: { projectId: job.projectId, interpretationKey: key, id: { not: i.id }, status: { in: ["passed", "accepted", "flagged"] }, reusedFrom: null }, orderBy: { createdAt: "asc" },
  });
  if (!prior) return { reused: false };
  await withTx(async (tx) => {
    await tx.interpretation.update({
      where: { id: i.id },
      data: {
        status: "passed", reusedFrom: prior.id, provider: prior.provider, modelVersion: prior.modelVersion, parameters: dbJson(prior.parameters), output: dbJson(prior.output),
        offered: dbJson(prior.offered), rendered: dbJson(prior.rendered), checkReport: dbJson(prior.checkReport), attempts: 0, inputTokens: 0, outputTokens: 0, cost: 0, completedAt: new Date(),
      },
    });
    const claims = await tx.interpretationClaim.findMany({ where: { interpretationId: prior.id } });
    await tx.interpretationClaim.createMany({ data: claims.map((c) => ({ ...c, interpretationId: i.id, citations: toJson(c.citations), metrics: toJson(c.metrics) })) });
    const draft = await tx.interpretationVersion.findUnique({ where: { interpretationId_version: { interpretationId: prior.id, version: 1 } }, select: { content: true } });
    if (draft) await tx.interpretationVersion.create({ data: { interpretationId: i.id, version: 1, kind: "model_draft", content: toJson(draft.content) } });
  });
  return { reused: true };
}

interface Offer extends CheckContext { refs: Record<string, { itemType: string; itemId: string; itemVersion: string | null; contentRef: string | null }>; validated: { id: string; action: string }[] }

/** E-refs follow the bundle's ordinal order (included items only); M-refs are its numeric metric items. */
async function buildOffer(projectId: string, i: { targetType: string; evidenceBundleId: string | null }): Promise<Offer> {
  const row = await db().evidenceBundle.findUniqueOrThrow({ where: { id: i.evidenceBundleId! }, select: { objectKey: true } });
  const bundle = EvidenceBundle.parse(await getJson(projectId, row.objectKey));
  const included = bundle.items.filter((x) => x.included);
  const items: OfferedItem[] = included.map((x, n) => ({ ref: `E${n + 1}`, itemType: x.itemType, itemId: x.itemId, itemVersion: x.itemVersion, content: x.content ?? {} }));
  const refs = Object.fromEntries(included.map((x, n) => [`E${n + 1}`, { itemType: x.itemType, itemId: x.itemId, itemVersion: x.itemVersion, contentRef: x.contentRef }]));
  const metrics: OfferedMetric[] = [];
  for (const it of items) {
    if (it.itemType !== "metric_value" || typeof it.content.value !== "number") continue;
    const [metricKey, version] = String(it.itemVersion ?? "").split("@");
    metrics.push({ ref: `M${metrics.length + 1}`, evidenceRef: it.ref, metric: String(it.content.metric), value: it.content.value, unit: String(it.content.unit ?? "number"),
      metricKey: String(it.content.metricKey ?? metricKey ?? it.itemVersion ?? ""), metricVersion: Number(it.content.metricVersion ?? version ?? 0) || 0 });
  }
  const validated = items.filter((x) => x.itemType === "comparison_candidate" && x.content.validationStatus === "validated").map((x) => ({ id: x.itemId, action: String(x.content.action) }));
  const caveats: CheckContext["requiredCaveats"] = [];
  if (bundle.contextLimited) caveats.push({ key: "context_limited", keywords: ["konteks terbatas", "bukti terbatas"], label: "konteks terbatas" });
  if (bundle.contextMaybeStale) caveats.push({ key: "context_maybe_stale", keywords: ["belum mutakhir", "mungkin usang"], label: "bukti mungkin belum mutakhir" });
  const finding = items.find((x) => x.itemType === "finding");
  if ((finding?.content.population as { smallSample?: boolean } | undefined)?.smallSample) caveats.push({ key: "small_sample", keywords: ["sampel kecil"], label: "sampel kecil" });
  if (items.some((x) => x.itemType === "comparison_candidate" && x.content.stale)) caveats.push({ key: "stale_validation", keywords: ["validasi usang", "belum divalidasi ulang"], label: "validasi kandidat usang" });
  return { target: i.targetType as InterpretationTarget, items, metrics, validatedCandidateIds: validated.map((v) => v.id), requiredCaveats: caveats, refs, validated };
}

function buildPrompt(body: PromptTemplateBody, offer: Offer, i: { targetType: string; audience: string }, repair: { output: unknown; violations: Violation[] } | null) {
  const system = [body.role, "", "ATURAN:", ...body.rules.map((r) => `- ${r}`), "", `GAYA: ${body.tone}`, body.example ? `\n${body.example}` : ""].join("\n");
  const audience = i.audience === "analyst" ? "Analis" : "Pemilik proses";
  const data = [
    "BUKTI:",
    ...offer.items.map((x) => `${x.ref} [${x.itemType}] ${JSON.stringify(x.content)}`),
    "",
    "METRIK (tulis sebagai placeholder, bukan angka):",
    ...(offer.metrics.length ? offer.metrics.map((m) => `${m.ref} = ${m.metric} (${m.unit}) dari ${m.evidenceRef}; tampil sebagai "${formatMetric(m)}"`) : ["(tidak ada)"]),
    "",
    "KANDIDAT TERVALIDASI:",
    ...(offer.validated.length ? offer.validated.map((v) => `${v.id}: ${v.action}`) : ["(tidak ada)"]),
    "",
    "BATASAN (wajib disebut di uncertainties):",
    ...(offer.requiredCaveats.length ? offer.requiredCaveats.map((c) => `- ${c.label} (kata kunci: "${c.keywords[0]}")`) : ["(tidak ada)"]),
  ].join("\n");
  const parts = [`Target: ${i.targetType}. Pembaca: ${audience}.`, "", "<data>", data, "</data>"];
  if (repair) {
    parts.push("", "Draft sebelumnya ditolak pemeriksa otomatis. Susun ulang seluruh draft dan perbaiki pelanggaran berikut:", ...repair.violations.slice(0, 30).map((v) => `- [${v.check}] ${v.message}${v.claim ? ` — "${v.claim}"` : ""}`), "", "Draft sebelumnya:", JSON.stringify(repair.output).slice(0, 12000));
  }
  return { system, prompt: parts.join("\n") };
}

async function assertBudget(projectId: string) {
  const limit = Number(process.env.LLM_DAILY_BUDGET_CALLS ?? 200);
  const used = await db().modelUsageEvent.count({ where: { projectId, kind: "llm", createdAt: { gt: startOfDay() } } });
  if (used >= limit) throw ApplicationFailure.nonRetryable(`Anggaran harian LLM proyek habis (${used}/${limit} panggilan)`, "BudgetExceeded");
}

/** One generate → schema → checks round. Every attempt and its report is stored, passed or not. */
export async function generateAttempt(job: InterpretationJob & { attempt: number }): Promise<{ ok: boolean; violations: Violation[] }> {
  const i = await db().interpretation.findUniqueOrThrow({ where: { id: job.interpretationId } });
  if (["passed", "failed_check", "failed", "accepted", "flagged"].includes(i.status)) return { ok: i.status !== "failed_check" && i.status !== "failed", violations: [] };
  const done = await db().interpretationAttempt.findUnique({ where: { interpretationId_attempt: { interpretationId: i.id, attempt: job.attempt } }, select: { ok: true } });
  if (done) {
    const r = await db().checkReport.findUniqueOrThrow({ where: { interpretationId_attempt: { interpretationId: i.id, attempt: job.attempt } }, select: { violations: true } });
    return { ok: done.ok, violations: jsonAs<Violation[]>(r.violations) };
  }
  const adapter = llmAdapter();
  const t = await db().promptTemplate.findUniqueOrThrow({ where: { id: i.promptTemplateId! }, select: { body: true } });
  const body = PromptTemplateBody.parse(t.body);
  const offer = await buildOffer(job.projectId, i);
  let repair: { output: unknown; violations: Violation[] } | null = null;
  if (job.attempt > 1) {
    const prevKey = { interpretationId_attempt: { interpretationId: i.id, attempt: job.attempt - 1 } };
    const prev = await db().interpretationAttempt.findUniqueOrThrow({ where: prevKey, select: { rawKey: true } });
    const report = await db().checkReport.findUniqueOrThrow({ where: prevKey, select: { violations: true } });
    repair = { output: (await getJson<{ output: unknown }>(job.projectId, prev.rawKey)).output, violations: jsonAs<Violation[]>(report.violations) };
  }
  await db().interpretation.update({ where: { id: i.id }, data: { status: job.attempt > 1 ? "repairing" : "generating" } });
  const { system, prompt } = buildPrompt(body, offer, i, repair);
  await assertBudget(job.projectId);
  const res = await adapter.generateStructured({
    system, prompt, idempotencyKey: `${i.interpretationKey}:${job.attempt}`,
    data: { ...offer, audience: i.audience, attempt: job.attempt, fixtureDirective: body.example.includes("fixture:invalid") ? "invalid" : undefined },
  });
  const rawKey = `projects/${job.projectId}/model-output/llm/${i.id}/${job.attempt}.json`;
  await putJson(job.projectId, rawKey, { attempt: job.attempt, system, prompt, meta: res.meta, output: res.output, text: res.text, response: res.raw });

  await db().interpretation.update({ where: { id: i.id }, data: { status: "checking" } });
  const check = checkInterpretation(res.output, offer);
  await withTx(async (tx) => {
    await tx.interpretationAttempt.create({
      data: {
        interpretationId: i.id, attempt: job.attempt, requestId: res.meta.requestId, model: res.meta.modelVersion, finishReason: res.meta.finishReason,
        latencyMs: Math.round(res.meta.latencyMs), inputTokens: res.meta.inputTokens, outputTokens: res.meta.outputTokens, rawKey, ok: check.ok,
      },
    });
    await tx.checkReport.create({ data: { interpretationId: i.id, attempt: job.attempt, checkerVersion: CHECKER_VERSION, ok: check.ok, violations: toJson(check.violations) } });
    await tx.modelUsageEvent.create({
      data: {
        projectId: job.projectId, kind: "llm", provider: res.meta.provider, model: res.meta.model, modelVersion: res.meta.modelVersion, requestId: res.meta.requestId,
        operation: `interpretation:attempt${job.attempt}`, latencyMs: Math.round(res.meta.latencyMs), inputTokens: res.meta.inputTokens, outputTokens: res.meta.outputTokens,
        cost: res.meta.cost, rawKey, subjectId: i.id,
      },
    });
    const sum = await tx.modelUsageEvent.aggregate({ where: { subjectId: i.id, kind: "llm" }, _sum: { inputTokens: true, outputTokens: true, cost: true } });
    await tx.interpretation.update({
      where: { id: i.id },
      data: {
        attempts: job.attempt, provider: res.meta.provider, modelVersion: res.meta.modelVersion, parameters: toJson(res.meta.parameters),
        inputTokens: sum._sum.inputTokens, outputTokens: sum._sum.outputTokens, cost: sum._sum.cost,
      },
    });
    if (!check.ok) return;
    const rendered = renderClaims(check.parsed!, offer.metrics);
    const offered = { refs: offer.refs, metrics: offer.metrics, validated: offer.validated, caveats: offer.requiredCaveats };
    const report = { checkerVersion: CHECKER_VERSION, attempts: job.attempt, ok: true, violations: [] };
    let ordinal = 0;
    await tx.interpretationClaim.createMany({
      data: rendered.flatMap((s) => s.claims.map((c) => ({
        interpretationId: i.id, ordinal: ++ordinal, sectionKey: s.key, claimType: c.type, textTemplate: c.text_template, text: c.text,
        citations: toJson(c.citations.map((r) => ({ ref: r, ...offer.refs[r] }))), metrics: toJson(c.metrics), candidateId: c.candidate_id,
      }))),
    });
    const content = toJson({ sections: rendered, assumptions: check.parsed!.assumptions, uncertainties: check.parsed!.uncertainties, followUpQuestions: check.parsed!.follow_up_questions });
    await tx.interpretationVersion.create({ data: { interpretationId: i.id, version: 1, kind: "model_draft", content } });
    await tx.interpretation.update({
      where: { id: i.id },
      data: { status: "passed", output: toJson(check.parsed), offered: toJson(offered), rendered: content, checkReport: report, completedAt: new Date() },
    });
  });
  return { ok: check.ok, violations: check.violations };
}

/** After the last attempt still fails the checks, only the violation summary is kept for display. */
export async function markFailedCheck(job: InterpretationJob & { violations: Violation[] }): Promise<void> {
  const i = await db().interpretation.findUniqueOrThrow({ where: { id: job.interpretationId }, select: { attempts: true } });
  await db().interpretation.updateMany({
    where: { id: job.interpretationId, status: { in: ["queued", "generating", "checking", "repairing"] } },
    data: { status: "failed_check", checkReport: toJson({ checkerVersion: CHECKER_VERSION, attempts: i.attempts, ok: false, violations: job.violations }), completedAt: new Date() },
  });
}

export async function markInterpretationFailed(job: InterpretationJob & { message: string }): Promise<void> {
  await db().interpretation.updateMany({
    where: { id: job.interpretationId, status: { in: ["queued", "generating", "checking", "repairing"] } }, data: { status: "failed", errorMessage: job.message.slice(0, 500), completedAt: new Date() },
  });
}

export async function completeInterpretation(job: InterpretationJob): Promise<string> {
  const i = await db().interpretation.findUniqueOrThrow({ where: { id: job.interpretationId } });
  await audit(db(), {
    projectId: job.projectId, actorId: job.requestedBy, action: "interpretation.generate", objectType: "interpretation", objectId: job.interpretationId,
    result: i.status === "passed" ? "success" : "failed", correlationId: job.correlationId,
    metadata: { status: i.status, targetType: i.targetType, targetId: i.targetId, audience: i.audience, attempts: i.attempts, model: i.modelVersion, inputTokens: i.inputTokens, outputTokens: i.outputTokens, cost: i.cost, reusedFrom: i.reusedFrom, error: i.errorMessage },
  });
  return i.status;
}
