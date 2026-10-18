import "server-only";
import { defaultPromptTemplate, InterpretationRequest, PromptTemplateInput, type Audience, type InterpretationTarget } from "@nora/contracts";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { can } from "./projects";

type Row = Record<string, any>;
const UUID = /^[0-9a-f-]{36}$/i;
const IN_FLIGHT = ["queued", "generating", "checking", "repairing"];

/** The finding a target belongs to; null when the target is not in this project. */
async function targetFinding(projectId: string, targetType: InterpretationTarget, targetId: string): Promise<string | null> {
  const sql = {
    finding: "SELECT id AS finding_id FROM findings WHERE id = $1 AND project_id = $2",
    assessment: "SELECT finding_id FROM assessments WHERE id = $1 AND project_id = $2 AND status IN ('automatic', 'needs_review', 'insufficient_information')",
    candidate_comparison: "SELECT finding_id FROM candidate_comparisons WHERE id = $1 AND project_id = $2",
  }[targetType];
  return (await db().query<{ finding_id: string }>(sql, [targetId, projectId])).rows[0]?.finding_id ?? null;
}

async function enqueue(viewer: Viewer, projectId: string, t: { targetType: string; targetId: string; findingId: string; audience: string; nonce: string | null; regeneratedFrom: string | null }, action: string, correlationId: string) {
  const id = await withTx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO interpretations (project_id, target_type, target_id, finding_id, audience, nonce, regenerated_from, requested_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [projectId, t.targetType, t.targetId, t.findingId, t.audience, t.nonce, t.regeneratedFrom, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action, objectType: "interpretation", objectId: rows[0]!.id, correlationId, metadata: { targetType: t.targetType, targetId: t.targetId, audience: t.audience, regeneratedFrom: t.regeneratedFrom } });
    return rows[0]!.id;
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
  const running = (await db().query<{ id: string; status: string }>(
    "SELECT id, status FROM interpretations WHERE project_id = $1 AND target_id = $2 AND audience = $3 AND status = ANY($4::text[]) ORDER BY created_at DESC LIMIT 1",
    [projectId, r.targetId, r.audience, IN_FLIGHT],
  )).rows[0];
  if (running) return { id: running.id, status: running.status, reused: true };
  return enqueue(viewer, projectId, { ...r, findingId, nonce: null, regeneratedFrom: null }, "interpretation.request", correlationId);
}

/** An explicit regenerate gets a new nonce, so it never reuses the earlier result. */
export async function regenerateInterpretation(viewer: Viewer, projectId: string, id: string, correlationId: string) {
  await can(viewer, "interpretation.request", projectId);
  const i = await row(projectId, id);
  if (IN_FLIGHT.includes(i.status)) throw conflict("Interpretasi masih diproses");
  return enqueue(viewer, projectId, { targetType: i.target_type, targetId: i.target_id, findingId: i.finding_id, audience: i.audience, nonce: crypto.randomUUID(), regeneratedFrom: id }, "interpretation.regenerate", correlationId);
}

async function row(projectId: string, id: string): Promise<Row> {
  if (!UUID.test(id)) throw notFound();
  const r = (await db().query("SELECT * FROM interpretations WHERE id = $1 AND project_id = $2", [id, projectId])).rows[0];
  if (!r) throw notFound();
  return r;
}

/** Superseded when the finding's data/context moved on, or a comparison's candidates were validated again. */
const STALE = `(EXISTS (SELECT 1 FROM findings f JOIN dataset_versions d ON d.id = f.dataset_version_id JOIN context_packages p ON p.id = f.context_package_id
                  WHERE f.id = i.finding_id AND (d.status <> 'published' OR p.status <> 'active'))
   OR (i.target_type = 'candidate_comparison' AND EXISTS (SELECT 1 FROM candidate_comparisons c JOIN candidate_validations v ON v.candidate_link_id = ANY(c.candidate_link_ids)
                  WHERE c.id = i.target_id AND v.created_at > c.created_at))
   OR (i.target_type = 'assessment' AND EXISTS (SELECT 1 FROM assessments a JOIN assessments b ON b.candidate_link_id = a.candidate_link_id AND b.created_at > a.created_at AND b.status <> 'failed'
                  WHERE a.id = i.target_id)))`;

const SUMMARY_COLS = `i.id, i.target_type AS "targetType", i.target_id AS "targetId", i.finding_id AS "findingId", i.audience, i.status, i.attempts,
  i.provider, i.model, i.model_version AS "modelVersion", i.template_version AS "templateVersion", i.checker_version AS "checkerVersion",
  i.evidence_bundle_id AS "evidenceBundleId", i.reused_from AS "reusedFrom", i.regenerated_from AS "regeneratedFrom",
  i.input_tokens AS "inputTokens", i.output_tokens AS "outputTokens", i.cost, i.error_message AS "errorMessage",
  i.created_at AS "createdAt", i.completed_at AS "completedAt", i.accepted_at AS "acceptedAt", i.flagged_at AS "flaggedAt", i.flag_reason AS "flagReason",
  ua.name AS "acceptedBy", uf.name AS "flaggedBy", ${STALE} AS stale`;
const SUMMARY_FROM = "interpretations i LEFT JOIN users ua ON ua.id = i.accepted_by LEFT JOIN users uf ON uf.id = i.flagged_by";

export async function listInterpretations(viewer: Viewer, projectId: string, targetId: string) {
  await can(viewer, "project.read", projectId);
  if (!UUID.test(targetId)) throw badRequest("targetId wajib diisi");
  const { rows } = await db().query(`SELECT ${SUMMARY_COLS} FROM ${SUMMARY_FROM} WHERE i.project_id = $1 AND i.target_id = $2 ORDER BY i.created_at DESC LIMIT 50`, [projectId, targetId]);
  const usage = (await db().query(
    `SELECT count(*)::int AS calls, coalesce(sum(input_tokens), 0)::int AS "inputTokens", coalesce(sum(output_tokens), 0)::int AS "outputTokens", sum(cost) AS cost
       FROM model_usage_events WHERE project_id = $1 AND kind = 'llm'`, [projectId],
  )).rows[0];
  return { interpretations: rows, usage };
}

/**
 * Draft, claims and checks. A draft that failed the checks returns only its violation summary;
 * the model text never reaches the page as a usable result.
 */
export async function getInterpretation(viewer: Viewer, projectId: string, id: string) {
  await can(viewer, "project.read", projectId);
  await row(projectId, id);
  const i = (await db().query(`SELECT ${SUMMARY_COLS}, i.rendered, i.offered, i.check_report AS "checkReport", i.parameters FROM ${SUMMARY_FROM} WHERE i.id = $1`, [id])).rows[0]!;
  const usable = ["passed", "accepted", "flagged"].includes(i.status);
  const claims = usable ? (await db().query(
    `SELECT ordinal, section_key AS "section", claim_type AS type, text, citations, metrics, candidate_id AS "candidateId" FROM interpretation_claims WHERE interpretation_id = $1 ORDER BY ordinal`, [id],
  )).rows : [];
  const attempts = (await db().query(
    `SELECT a.attempt, a.model, a.finish_reason AS "finishReason", a.latency_ms AS "latencyMs", a.input_tokens AS "inputTokens", a.output_tokens AS "outputTokens", a.ok, a.created_at AS "createdAt",
            r.violations FROM interpretation_attempts a LEFT JOIN check_reports r ON r.interpretation_id = a.interpretation_id AND r.attempt = a.attempt
      WHERE a.interpretation_id = $1 ORDER BY a.attempt`, [id],
  )).rows;
  const versions = (await db().query(
    `SELECT v.version, v.kind, v.created_at AS "createdAt", u.name AS "createdBy", v.content->>'note' AS note FROM interpretation_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.interpretation_id = $1 ORDER BY v.version`, [id],
  )).rows;
  const content = usable ? i.rendered : null;
  return {
    ...i, rendered: undefined, offered: undefined,
    modelGenerated: i.status !== "accepted",
    assumptions: content?.assumptions ?? [], uncertainties: content?.uncertainties ?? [], followUpQuestions: content?.followUpQuestions ?? [],
    sections: usable ? (content.sections as { key: string }[]).map((s) => ({ key: s.key, claims: claims.filter((c) => c.section === s.key) })) : [],
    validated: usable ? i.offered?.validated ?? [] : [],
    attempts, versions,
  };
}

export async function acceptInterpretation(viewer: Viewer, projectId: string, id: string, note: string | null, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const i = await row(projectId, id);
  if (i.status !== "passed") throw conflict(i.status === "accepted" ? "Interpretasi sudah diterima" : "Hanya draft yang lolos pemeriksaan yang dapat diterima");
  if (!i.rendered) throw conflict("Draft tidak memiliki isi");
  await withTx(async (tx) => {
    // The accepted summary is a new version; version 1 (the model draft) and the check report stay untouched.
    await tx.query("INSERT INTO interpretation_versions (interpretation_id, version, kind, content, created_by) VALUES ($1, 2, 'accepted_summary', $2, $3)",
      [id, JSON.stringify({ ...i.rendered, note }), viewer.id]);
    await tx.query("UPDATE interpretations SET status = 'accepted', accepted_by = $2, accepted_at = now() WHERE id = $1", [id, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.accept", objectType: "interpretation", objectId: id, correlationId, metadata: { targetType: i.target_type, targetId: i.target_id, note } });
  });
  return { id, status: "accepted" };
}

export async function flagInterpretation(viewer: Viewer, projectId: string, id: string, reason: string, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const i = await row(projectId, id);
  if (!["passed", "accepted"].includes(i.status)) throw conflict("Hanya draft yang lolos pemeriksaan yang dapat ditandai");
  await withTx(async (tx) => {
    await tx.query("UPDATE interpretations SET status = 'flagged', flagged_by = $2, flagged_at = now(), flag_reason = $3 WHERE id = $1", [id, viewer.id, reason]);
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.flag", objectType: "interpretation", objectId: id, correlationId, metadata: { reason, previousStatus: i.status } });
  });
  return { id, status: "flagged" };
}

const TARGETS: InterpretationTarget[] = ["finding", "assessment", "candidate_comparison"];
const AUDIENCE_LIST: Audience[] = ["analyst", "process_owner"];

/** Active template per target × audience (the built-in default until a project version exists), plus history. */
export async function listPromptTemplates(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const { rows } = await db().query(
    `SELECT id, target_type AS "targetType", audience, version, body, status, created_at AS "createdAt" FROM prompt_templates WHERE project_id = $1 ORDER BY target_type, audience, version DESC`, [projectId],
  );
  const active = TARGETS.flatMap((t) => AUDIENCE_LIST.map((a) => rows.find((r) => r.targetType === t && r.audience === a && r.status === "active")
    ?? { id: null, targetType: t, audience: a, version: 1, body: defaultPromptTemplate(t, a), status: "default" }));
  return { active, history: rows };
}

export async function createPromptTemplate(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "interpretation.review", projectId);
  const parsed = PromptTemplateInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Template tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const t = parsed.data;
  return withTx(async (tx) => {
    // Version 1 is always the built-in default, so a project's first own template is version 2.
    const current = (await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM prompt_templates WHERE project_id = $1 AND target_type = $2 AND audience = $3", [projectId, t.targetType, t.audience])).rows[0]!.v;
    if (current == null) {
      await tx.query("INSERT INTO prompt_templates (project_id, target_type, audience, version, body, status) VALUES ($1, $2, $3, 1, $4, 'superseded')",
        [projectId, t.targetType, t.audience, JSON.stringify(defaultPromptTemplate(t.targetType, t.audience))]);
    }
    const version = (current ?? 1) + 1;
    await tx.query("UPDATE prompt_templates SET status = 'superseded' WHERE project_id = $1 AND target_type = $2 AND audience = $3", [projectId, t.targetType, t.audience]);
    const { rows } = await tx.query<{ id: string }>("INSERT INTO prompt_templates (project_id, target_type, audience, version, body, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [projectId, t.targetType, t.audience, version, JSON.stringify(t.body), viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "interpretation.template", objectType: "prompt_template", objectId: rows[0]!.id, correlationId, metadata: { targetType: t.targetType, audience: t.audience, version } });
    return { id: rows[0]!.id, version };
  });
}
