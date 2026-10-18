import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { authorize, AuthzError } from "@nora/authz";
import { withTx } from "@nora/db";
import {
  CHECKER_VERSION, checkInterpretation, defaultPromptTemplate, EvidenceBundle, formatMetric, interpretationKeyInput, PromptTemplateBody, renderClaims,
  type Audience, type CheckContext, type InterpretationTarget, type OfferedItem, type OfferedMetric, type Violation,
} from "@nora/contracts";
import type { NodeRef } from "@nora/graph";
import { getJson, putJson } from "@nora/storage";
import { llmAdapter, llmModelLabel } from "../adapters/llm.ts";
import { audit, db } from "../db.ts";
import { findingCandidates, registerEvidenceSource, type Candidate } from "./evidence.ts";
import { registerGraphHandler } from "./graph.ts";

type Row = Record<string, any>;
export interface InterpretationJob { projectId: string; interpretationId: string; requestedBy: string; correlationId: string }

const one = async (sql: string, p: unknown[]): Promise<Row | undefined> => (await db().query(sql, p)).rows[0];
const many = async (sql: string, p: unknown[]): Promise<Row[]> => (await db().query(sql, p)).rows;
export const MAX_ATTEMPTS = 3;

// ---------- Evidence sources for the two non-finding targets ----------

const shift = (items: Candidate[], by: number) => items.map((c) => ({ ...c, priority: Math.min(9, c.priority + by) }));

/** A stored comparison snapshot: each candidate's values exactly as compared, then the finding's own evidence. */
async function comparisonCandidates(projectId: string, comparisonId: string, purpose: string): Promise<Candidate[]> {
  const c = await one("SELECT * FROM candidate_comparisons WHERE id = $1 AND project_id = $2", [comparisonId, projectId]);
  if (!c) throw ApplicationFailure.nonRetryable("comparison not found in project", "NotFound");
  const C = { type: "Comparison", id: comparisonId };
  const out: Candidate[] = [];
  for (const k of c.payload.candidates as Row[]) {
    const r = k.rows as Row;
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
  return [...out, ...shift(await findingCandidates(projectId, c.finding_id, purpose), 1)];
}

/** One Jev assessment summary: conclusion, probabilities, criterion scores, then the finding's evidence. */
async function assessmentCandidates(projectId: string, assessmentId: string, purpose: string): Promise<Candidate[]> {
  const a = await one(`SELECT a.*, l.candidate_key, l.candidate_type, l.candidate_id FROM assessments a JOIN candidate_links l ON l.id = a.candidate_link_id WHERE a.id = $1 AND a.project_id = $2`, [assessmentId, projectId]);
  if (!a) throw ApplicationFailure.nonRetryable("assessment not found in project", "NotFound");
  const A = { type: "Assessment", id: assessmentId };
  const action = a.candidate_type === "analyst"
    ? (await one("SELECT payload->>'description' AS action FROM analyst_candidates WHERE id = $1", [a.candidate_id]))?.action
    : (await one("SELECT payload->>'action' AS action FROM interventions WHERE id = $1", [a.candidate_id]))?.action;
  const corr = await one("SELECT kind, conclusion FROM assessment_corrections WHERE assessment_id = $1 ORDER BY created_at DESC LIMIT 1", [assessmentId]);
  const out: Candidate[] = [{
    itemType: "assessment_result", itemId: assessmentId, itemVersion: a.model_version, priority: 1, graphRef: A,
    content: { candidateKey: a.candidate_key, candidateAction: action, status: a.status, conclusion: a.conclusion, humanReview: corr ? { kind: corr.kind, conclusion: corr.conclusion } : null,
      missingCriteria: a.missing_criteria, contextLimited: a.context_limited, model: a.model },
  }];
  const metric = (name: string, value: unknown, unit: string) => {
    if (typeof value === "number") out.push({ itemType: "metric_value", itemId: `${assessmentId}:${name}`, itemVersion: a.model_version, priority: 1, graphRef: A, content: { metric: name, value, unit } });
  };
  metric("sufficiencyProbability", a.sufficiency_probability, "ratio");
  metric("topProbability", a.top_probability, "ratio");
  metric("margin", a.margin, "ratio");
  metric("totalScore", a.total_score, "number");
  for (const c of await many("SELECT criterion_key, score FROM assessment_criterion_results WHERE assessment_id = $1 ORDER BY criterion_key", [assessmentId])) metric(`criterion:${c.criterion_key}`, c.score, "number");
  return [...out, ...shift(await findingCandidates(projectId, a.finding_id, purpose), 1)];
}

registerEvidenceSource("candidate_comparison", (p, t, purpose) => comparisonCandidates(p, t, purpose));
registerEvidenceSource("assessment", (p, t, purpose) => assessmentCandidates(p, t, purpose));

// ---------- Graph projection of comparisons and interpretations ----------

const ref = (type: NodeRef["type"], id: string): NodeRef => ({ type, id });
const TARGET_NODE: Record<string, NodeRef["type"]> = { finding: "Finding", assessment: "Assessment", candidate_comparison: "Comparison" };

registerGraphHandler("candidate_comparisons", async (w, id) => {
  const c = await one("SELECT * FROM candidate_comparisons WHERE id = $1", [id]);
  if (!c) return;
  const m = { creatorType: "human", recordId: id, at: c.created_at };
  await w.node(ref("Comparison", id), `Perbandingan ${c.candidate_link_ids.length} kandidat`, { candidates: c.candidate_link_ids.length });
  await w.rel("DERIVED_FROM", ref("Comparison", id), ref("Finding", c.finding_id), m);
  for (const b of c.bundle_ids as string[]) await w.rel("CITES", ref("Comparison", id), ref("EvidenceBundle", b), m);
});

registerGraphHandler("interpretations", async (w, id) => {
  const i = await one("SELECT * FROM interpretations WHERE id = $1", [id]);
  if (!i || !["passed", "accepted", "flagged"].includes(i.status)) return;
  const m = { creatorType: "model", recordId: id, at: i.completed_at, version: i.model_version, status: i.status };
  await w.node(ref("Interpretation", id), `Interpretasi (${i.audience})`, { status: i.status, audience: i.audience, model: i.model, checker: i.checker_version });
  await w.rel("DERIVED_FROM", ref("Interpretation", id), ref(TARGET_NODE[i.target_type]!, i.target_id), m);
  if (i.evidence_bundle_id) await w.rel("CITES", ref("Interpretation", id), ref("EvidenceBundle", i.evidence_bundle_id), m);
  if (i.status === "accepted" || i.status === "flagged") {
    await w.rel("REVIEWED", ref("Interpretation", id), ref(TARGET_NODE[i.target_type]!, i.target_id), { creatorType: "human", recordId: id, at: i.accepted_at ?? i.flagged_at, status: i.status });
  }
});

// ---------- Workflow activities ----------

export async function startInterpretation(job: InterpretationJob): Promise<{ targetType: InterpretationTarget; targetId: string }> {
  try {
    await authorize(db(), job.requestedBy, "interpretation.request", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  const i = await one("SELECT target_type, target_id FROM interpretations WHERE id = $1 AND project_id = $2", [job.interpretationId, job.projectId]);
  if (!i) throw ApplicationFailure.nonRetryable("interpretation not found", "NotFound");
  return { targetType: i.target_type, targetId: i.target_id };
}

export async function activeTemplate(projectId: string, targetType: string, audience: string): Promise<{ id: string; version: number; body: PromptTemplateBody }> {
  await db().query(
    `INSERT INTO prompt_templates (project_id, target_type, audience, version, body) SELECT $1, $2, $3, 1, $4
      WHERE NOT EXISTS (SELECT 1 FROM prompt_templates WHERE project_id = $1 AND target_type = $2 AND audience = $3) ON CONFLICT DO NOTHING`,
    [projectId, targetType, audience, JSON.stringify(defaultPromptTemplate(targetType as InterpretationTarget, audience as Audience))],
  );
  const t = (await one("SELECT id, version, body FROM prompt_templates WHERE project_id = $1 AND target_type = $2 AND audience = $3 AND status = 'active' ORDER BY version DESC LIMIT 1", [projectId, targetType, audience]))!;
  return { id: t.id, version: t.version, body: PromptTemplateBody.parse(t.body) };
}

/** Fixes the bundle, template and model for this request; a passed result with the same key is reused instead of calling the model. */
export async function prepareInterpretation(job: InterpretationJob & { bundleId: string }): Promise<{ reused: boolean }> {
  const i = (await one("SELECT * FROM interpretations WHERE id = $1", [job.interpretationId]))!;
  const b = (await one("SELECT hash FROM evidence_bundles WHERE id = $1", [job.bundleId]))!;
  const t = await activeTemplate(job.projectId, i.target_type, i.audience);
  const model = llmModelLabel();
  const key = createHash("sha256").update(interpretationKeyInput(b.hash, `${i.target_type}/${i.audience}@${t.version}`, model, i.audience, i.nonce)).digest("hex");
  await db().query(
    "UPDATE interpretations SET evidence_bundle_id = $2, prompt_template_id = $3, template_version = $4, checker_version = $5, interpretation_key = $6, model = $7 WHERE id = $1",
    [i.id, job.bundleId, t.id, t.version, CHECKER_VERSION, key, model],
  );
  if (i.nonce) return { reused: false };
  const prior = await one(
    "SELECT * FROM interpretations WHERE project_id = $1 AND interpretation_key = $2 AND id <> $3 AND status IN ('passed', 'accepted', 'flagged') AND reused_from IS NULL ORDER BY created_at LIMIT 1",
    [job.projectId, key, i.id],
  );
  if (!prior) return { reused: false };
  await withTx(db(), async (tx) => {
    await tx.query(
      `UPDATE interpretations SET status = 'passed', reused_from = $2, provider = $3, model_version = $4, parameters = $5, output = $6, offered = $7, rendered = $8, check_report = $9,
              attempts = 0, input_tokens = 0, output_tokens = 0, cost = 0, completed_at = now() WHERE id = $1`,
      [i.id, prior.id, prior.provider, prior.model_version, JSON.stringify(prior.parameters), JSON.stringify(prior.output), JSON.stringify(prior.offered), JSON.stringify(prior.rendered), JSON.stringify(prior.check_report)],
    );
    await tx.query(`INSERT INTO interpretation_claims SELECT $1, ordinal, section_key, claim_type, text_template, text, citations, metrics, candidate_id FROM interpretation_claims WHERE interpretation_id = $2`, [i.id, prior.id]);
    await tx.query(`INSERT INTO interpretation_versions (interpretation_id, version, kind, content) SELECT $1, 1, 'model_draft', content FROM interpretation_versions WHERE interpretation_id = $2 AND version = 1`, [i.id, prior.id]);
  });
  return { reused: true };
}

interface Offer extends CheckContext { refs: Record<string, { itemType: string; itemId: string; itemVersion: string | null; contentRef: string | null }>; validated: { id: string; action: string }[] }

/** E-refs follow the bundle's ordinal order (included items only); M-refs are its numeric metric items. */
async function buildOffer(projectId: string, i: Row): Promise<Offer> {
  const row = (await one("SELECT object_key FROM evidence_bundles WHERE id = $1", [i.evidence_bundle_id]))!;
  const bundle = EvidenceBundle.parse(await getJson(projectId, row.object_key));
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
  if ((finding?.content.population as Row | undefined)?.smallSample) caveats.push({ key: "small_sample", keywords: ["sampel kecil"], label: "sampel kecil" });
  if (items.some((x) => x.itemType === "comparison_candidate" && x.content.stale)) caveats.push({ key: "stale_validation", keywords: ["validasi usang", "belum divalidasi ulang"], label: "validasi kandidat usang" });
  return { target: i.target_type, items, metrics, validatedCandidateIds: validated.map((v) => v.id), requiredCaveats: caveats, refs, validated };
}

function buildPrompt(body: PromptTemplateBody, offer: Offer, i: Row, repair: { output: unknown; violations: Violation[] } | null) {
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
  const parts = [`Target: ${i.target_type}. Pembaca: ${audience}.`, "", "<data>", data, "</data>"];
  if (repair) {
    parts.push("", "Draft sebelumnya ditolak pemeriksa otomatis. Susun ulang seluruh draft dan perbaiki pelanggaran berikut:", ...repair.violations.slice(0, 30).map((v) => `- [${v.check}] ${v.message}${v.claim ? ` — "${v.claim}"` : ""}`), "", "Draft sebelumnya:", JSON.stringify(repair.output).slice(0, 12000));
  }
  return { system, prompt: parts.join("\n") };
}

async function assertBudget(projectId: string) {
  const limit = Number(process.env.LLM_DAILY_BUDGET_CALLS ?? 200);
  const used = (await one("SELECT count(*)::int AS n FROM model_usage_events WHERE project_id = $1 AND kind = 'llm' AND created_at > date_trunc('day', now())", [projectId]))!.n;
  if (used >= limit) throw ApplicationFailure.nonRetryable(`Anggaran harian LLM proyek habis (${used}/${limit} panggilan)`, "BudgetExceeded");
}

/** One generate → schema → checks round. Every attempt and its report is stored, passed or not. */
export async function generateAttempt(job: InterpretationJob & { attempt: number }): Promise<{ ok: boolean; violations: Violation[] }> {
  const i = (await one("SELECT * FROM interpretations WHERE id = $1", [job.interpretationId]))!;
  if (["passed", "failed_check", "failed", "accepted", "flagged"].includes(i.status)) return { ok: i.status !== "failed_check" && i.status !== "failed", violations: [] };
  const done = await one("SELECT ok FROM interpretation_attempts WHERE interpretation_id = $1 AND attempt = $2", [i.id, job.attempt]);
  if (done) {
    const r = (await one("SELECT violations FROM check_reports WHERE interpretation_id = $1 AND attempt = $2", [i.id, job.attempt]))!;
    return { ok: done.ok, violations: r.violations };
  }
  const adapter = llmAdapter();
  const t = (await one("SELECT body FROM prompt_templates WHERE id = $1", [i.prompt_template_id]))!;
  const body = PromptTemplateBody.parse(t.body);
  const offer = await buildOffer(job.projectId, i);
  let repair: { output: unknown; violations: Violation[] } | null = null;
  if (job.attempt > 1) {
    const prev = (await one("SELECT a.raw_key, r.violations FROM interpretation_attempts a JOIN check_reports r ON r.interpretation_id = a.interpretation_id AND r.attempt = a.attempt WHERE a.interpretation_id = $1 AND a.attempt = $2", [i.id, job.attempt - 1]))!;
    repair = { output: ((await getJson(job.projectId, prev.raw_key)) as Row).output, violations: prev.violations };
  }
  await db().query("UPDATE interpretations SET status = $2 WHERE id = $1", [i.id, job.attempt > 1 ? "repairing" : "generating"]);
  const { system, prompt } = buildPrompt(body, offer, i, repair);
  await assertBudget(job.projectId);
  const res = await adapter.generateStructured({
    system, prompt, idempotencyKey: `${i.interpretation_key}:${job.attempt}`,
    data: { ...offer, audience: i.audience, attempt: job.attempt, fixtureDirective: body.example.includes("fixture:invalid") ? "invalid" : undefined },
  });
  const rawKey = `projects/${job.projectId}/model-output/llm/${i.id}/${job.attempt}.json`;
  await putJson(job.projectId, rawKey, { attempt: job.attempt, system, prompt, meta: res.meta, output: res.output, text: res.text, response: res.raw });

  await db().query("UPDATE interpretations SET status = 'checking' WHERE id = $1", [i.id]);
  const check = checkInterpretation(res.output, offer);
  await withTx(db(), async (tx) => {
    await tx.query(
      `INSERT INTO interpretation_attempts (interpretation_id, attempt, request_id, model, finish_reason, latency_ms, input_tokens, output_tokens, raw_key, ok) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [i.id, job.attempt, res.meta.requestId, res.meta.modelVersion, res.meta.finishReason, Math.round(res.meta.latencyMs), res.meta.inputTokens, res.meta.outputTokens, rawKey, check.ok],
    );
    await tx.query("INSERT INTO check_reports (interpretation_id, attempt, checker_version, ok, violations) VALUES ($1, $2, $3, $4, $5)", [i.id, job.attempt, CHECKER_VERSION, check.ok, JSON.stringify(check.violations)]);
    await tx.query(
      `INSERT INTO model_usage_events (project_id, kind, provider, model, model_version, request_id, operation, latency_ms, input_tokens, output_tokens, cost, raw_key, subject_id)
       VALUES ($1, 'llm', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [job.projectId, res.meta.provider, res.meta.model, res.meta.modelVersion, res.meta.requestId, `interpretation:attempt${job.attempt}`, Math.round(res.meta.latencyMs), res.meta.inputTokens, res.meta.outputTokens, res.meta.cost, rawKey, i.id],
    );
    const sum = (await tx.query<Row>("SELECT sum(input_tokens)::int AS i, sum(output_tokens)::int AS o, sum(cost) AS c FROM model_usage_events WHERE subject_id = $1 AND kind = 'llm'", [i.id])).rows[0]!;
    await tx.query("UPDATE interpretations SET attempts = $2, provider = $3, model_version = $4, parameters = $5, input_tokens = $6, output_tokens = $7, cost = $8 WHERE id = $1",
      [i.id, job.attempt, res.meta.provider, res.meta.modelVersion, JSON.stringify(res.meta.parameters), sum.i, sum.o, sum.c]);
    if (!check.ok) return;
    const rendered = renderClaims(check.parsed!, offer.metrics);
    const offered = { refs: offer.refs, metrics: offer.metrics, validated: offer.validated, caveats: offer.requiredCaveats };
    const report = { checkerVersion: CHECKER_VERSION, attempts: job.attempt, ok: true, violations: [] };
    let ordinal = 0;
    for (const s of rendered) {
      for (const c of s.claims) {
        await tx.query(
          "INSERT INTO interpretation_claims (interpretation_id, ordinal, section_key, claim_type, text_template, text, citations, metrics, candidate_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [i.id, ++ordinal, s.key, c.type, c.text_template, c.text, JSON.stringify(c.citations.map((r) => ({ ref: r, ...offer.refs[r] }))), JSON.stringify(c.metrics), c.candidate_id],
        );
      }
    }
    const content = { sections: rendered, assumptions: check.parsed!.assumptions, uncertainties: check.parsed!.uncertainties, followUpQuestions: check.parsed!.follow_up_questions };
    await tx.query("INSERT INTO interpretation_versions (interpretation_id, version, kind, content) VALUES ($1, 1, 'model_draft', $2)", [i.id, JSON.stringify(content)]);
    await tx.query("UPDATE interpretations SET status = 'passed', output = $2, offered = $3, rendered = $4, check_report = $5, completed_at = now() WHERE id = $1",
      [i.id, JSON.stringify(check.parsed), JSON.stringify(offered), JSON.stringify(content), JSON.stringify(report)]);
  });
  return { ok: check.ok, violations: check.violations };
}

/** After the last attempt still fails the checks, only the violation summary is kept for display. */
export async function markFailedCheck(job: InterpretationJob & { violations: Violation[] }): Promise<void> {
  const i = (await one("SELECT attempts FROM interpretations WHERE id = $1", [job.interpretationId]))!;
  await db().query("UPDATE interpretations SET status = 'failed_check', check_report = $2, completed_at = now() WHERE id = $1 AND status IN ('queued', 'generating', 'checking', 'repairing')",
    [job.interpretationId, JSON.stringify({ checkerVersion: CHECKER_VERSION, attempts: i.attempts, ok: false, violations: job.violations })]);
}

export async function markInterpretationFailed(job: InterpretationJob & { message: string }): Promise<void> {
  await db().query("UPDATE interpretations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1 AND status IN ('queued', 'generating', 'checking', 'repairing')", [job.interpretationId, job.message.slice(0, 500)]);
}

export async function completeInterpretation(job: InterpretationJob): Promise<string> {
  const i = (await one("SELECT status, attempts, cost, input_tokens, output_tokens, reused_from, target_type, target_id, audience, model_version, error_message FROM interpretations WHERE id = $1", [job.interpretationId]))!;
  await audit(db(), {
    projectId: job.projectId, actorId: job.requestedBy, action: "interpretation.generate", objectType: "interpretation", objectId: job.interpretationId,
    result: i.status === "passed" ? "success" : "failed", correlationId: job.correlationId,
    metadata: { status: i.status, targetType: i.target_type, targetId: i.target_id, audience: i.audience, attempts: i.attempts, model: i.model_version, inputTokens: i.input_tokens, outputTokens: i.output_tokens, cost: i.cost, reusedFrom: i.reused_from, error: i.error_message },
  });
  return i.status;
}
