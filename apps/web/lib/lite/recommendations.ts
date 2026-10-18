import "server-only";
import { createHash } from "node:crypto";
import { AnalystCandidateInput, DEFAULT_PRIORITY_WEIGHTS, PriorityWeights, stableStringify } from "@nora/contracts";
import { audit } from "./audit";
import type { Viewer } from "./auth";
import { db, withTx } from "./db";
import { listFindings } from "./findings";
import { badRequest, conflict, notFound } from "./http";
import { startJob } from "./jobs";
import { can } from "./projects";

export async function recommendationFindings(viewer: Viewer, projectId: string, runId?: string | null) {
  const { runId: run, findings } = await listFindings(viewer, projectId, { runId });
  if (!findings.length) return { runId: run, findings: [] };
  const counts = new Map((await db().query<{ finding_id: string; total: number; validated: number; review: number }>(
    `SELECT finding_id, count(*)::int AS total, count(*) FILTER (WHERE latest_status = 'validated')::int AS validated, count(*) FILTER (WHERE latest_status = 'needs_review')::int AS review
       FROM candidate_links WHERE project_id = $1 AND finding_id = ANY($2::uuid[]) GROUP BY finding_id`, [projectId, findings.map((f) => f.id)],
  )).rows.map((r) => [r.finding_id, r]));
  return { runId: run, findings: findings.map((f) => ({ ...f, candidates: counts.get(f.id) ?? { total: 0, validated: 0, review: 0 } })) };
}

export async function refreshRecommendations(viewer: Viewer, projectId: string, findingId: string, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const f = (await db().query<{ context_package_id: string }>("SELECT context_package_id FROM findings WHERE id = $1 AND project_id = $2", [findingId, projectId])).rows[0];
  if (!f) throw notFound();
  const running = (await db().query<{ id: string }>("SELECT id FROM candidate_sets WHERE finding_id = $1 AND status IN ('queued', 'validating') LIMIT 1", [findingId])).rows[0];
  if (running) return { id: running.id, reused: true };
  const id = await withTx(async (tx) => {
    const { rows } = await tx.query<{ id: string }>("INSERT INTO candidate_sets (project_id, finding_id, context_package_id, requested_by) VALUES ($1, $2, $3, $4) RETURNING id", [projectId, findingId, f.context_package_id, viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.refresh", objectType: "candidate_set", objectId: rows[0]!.id, correlationId, metadata: { findingId } });
    return rows[0]!.id;
  });
  await startJob("recommendationRefreshWorkflow", `recommendations-${id}`, [{ projectId, findingId, candidateSetId: id, requestedBy: viewer.id, correlationId }]);
  return { id, reused: false };
}

const CANDIDATE_COLS = `l.id, l.candidate_type AS "candidateType", l.candidate_id AS "candidateId", l.candidate_key AS "candidateKey", l.candidate_version AS "candidateVersion", l.origin,
  l.precondition_status AS "preconditionStatus",
  coalesce(i.payload, ac.payload) AS payload, coalesce(i.payload->>'action', ac.payload->>'description') AS action, ac.addressed_problem AS "addressedProblem",
  v.id AS "validationId", v.status, v.created_at AS "validatedAt", v.assessment_id AS "assessmentId", v.evidence_bundle_id AS "evidenceBundleId",
  s.id AS "scoreId", s.score, s.rank, s.partial, s.missing, s.components, s.policy_version AS "policyVersion", s.weights,
  (d.status <> 'published' OR p.status <> 'active' OR EXISTS (SELECT 1 FROM assessments a2 WHERE a2.candidate_link_id = l.id AND a2.created_at > v.created_at)) AS stale,
  coalesce((SELECT json_agg(json_build_object('key', c.check_key, 'status', c.status, 'failureStatus', c.failure_status, 'reason', c.reason, 'details', c.details) ORDER BY c.check_key)
            FROM validation_checks c WHERE c.validation_id = v.id), '[]') AS checks,
  a.conclusion, a.top_probability AS "topProbability", a.total_score AS "totalScore", a.status AS "assessmentStatus",
  (SELECT x.conclusion FROM assessment_corrections x WHERE x.assessment_id = a.id AND x.kind = 'correct' ORDER BY x.created_at DESC LIMIT 1) AS "correctedConclusion"`;
const CANDIDATE_FROM = `candidate_links l
  LEFT JOIN interventions i ON l.candidate_type = 'intervention' AND i.id = l.candidate_id
  LEFT JOIN analyst_candidates ac ON l.candidate_type = 'analyst' AND ac.id = l.candidate_id
  LEFT JOIN LATERAL (SELECT * FROM candidate_validations x WHERE x.candidate_link_id = l.id ORDER BY x.created_at DESC LIMIT 1) v ON true
  LEFT JOIN LATERAL (SELECT * FROM candidate_scores y WHERE y.validation_id = v.id ORDER BY y.created_at DESC LIMIT 1) s ON true
  LEFT JOIN assessments a ON a.id = v.assessment_id
  LEFT JOIN dataset_versions d ON d.id = v.dataset_version_id
  LEFT JOIN context_packages p ON p.id = v.context_package_id`;

export async function findingRecommendations(viewer: Viewer, projectId: string, findingId: string, statuses?: string[]) {
  await can(viewer, "project.read", projectId);
  if (!(await db().query("SELECT 1 FROM findings WHERE id = $1 AND project_id = $2", [findingId, projectId])).rows.length) throw notFound();
  const { rows } = await db().query(
    `SELECT ${CANDIDATE_COLS} FROM ${CANDIDATE_FROM} WHERE l.project_id = $1 AND l.finding_id = $2
      ORDER BY s.rank NULLS LAST, l.candidate_key`, [projectId, findingId],
  );
  const set = (await db().query(
    `SELECT id, status, error_message AS "errorMessage", created_at AS "createdAt", completed_at AS "completedAt" FROM candidate_sets WHERE finding_id = $1 ORDER BY created_at DESC LIMIT 1`, [findingId],
  )).rows[0] ?? null;
  const catalogSize = (await db().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM findings f JOIN context_package_refs r ON r.package_id = f.context_package_id AND r.ref_type = 'intervention' WHERE f.id = $1`, [findingId],
  )).rows[0]!.n;
  const filtered = statuses?.length ? rows.filter((r) => statuses.includes(r.status)) : rows;
  return { candidates: filtered, total: rows.length, set, catalogSize };
}

export async function getCandidate(viewer: Viewer, projectId: string, linkId: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw notFound();
  const row = (await db().query(`SELECT ${CANDIDATE_COLS}, l.finding_id AS "findingId", l.precondition_checks AS "preconditionChecks" FROM ${CANDIDATE_FROM} WHERE l.id = $1 AND l.project_id = $2`, [linkId, projectId])).rows[0];
  if (!row) throw notFound();
  const history = (await db().query(
    `SELECT v.id, v.status, v.created_at AS "createdAt", s.score, s.rank, s.policy_version AS "policyVersion" FROM candidate_validations v
       LEFT JOIN LATERAL (SELECT * FROM candidate_scores y WHERE y.validation_id = v.id ORDER BY y.created_at DESC LIMIT 1) s ON true
      WHERE v.candidate_link_id = $1 ORDER BY v.created_at DESC`, [linkId],
  )).rows;
  return { ...row, history };
}

export async function addAnalystCandidate(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const parsed = AnalystCandidateInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Kandidat tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const c = parsed.data;
  if (!(await db().query("SELECT 1 FROM findings WHERE id = $1 AND project_id = $2", [c.findingId, projectId])).rows.length) throw notFound();
  return withTx(async (tx) => {
    const payload = { description: c.description, successMetric: c.successMetric, ownerRole: c.ownerRole, effort: c.effort ?? null, risk: c.risk ?? null, prerequisites: c.prerequisites, exclusions: c.exclusions, conditions: c.conditions };
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO analyst_candidates (project_id, finding_id, payload, addressed_problem, source_reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [projectId, c.findingId, JSON.stringify(payload), c.addressedProblem, c.sourceReason, viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.candidate.add", objectType: "analyst_candidate", objectId: rows[0]!.id, correlationId, metadata: { findingId: c.findingId } });
    return { id: rows[0]!.id };
  });
}

export async function getPolicy(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const row = (await db().query<{ id: string; version: number; weights: PriorityWeights }>("SELECT id, version, weights FROM priority_policies WHERE project_id = $1 ORDER BY version DESC LIMIT 1", [projectId])).rows[0];
  return row ?? { id: null, version: 0, weights: DEFAULT_PRIORITY_WEIGHTS };
}

export async function savePolicy(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const parsed = PriorityWeights.safeParse(raw);
  if (!parsed.success) throw badRequest("Bobot tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  return withTx(async (tx) => {
    const v = ((await tx.query<{ v: number | null }>("SELECT max(version) AS v FROM priority_policies WHERE project_id = $1", [projectId])).rows[0]!.v ?? 0) + 1;
    const { rows } = await tx.query<{ id: string }>("INSERT INTO priority_policies (project_id, version, weights, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [projectId, v, JSON.stringify(parsed.data), viewer.id]);
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.policy", objectType: "priority_policy", objectId: rows[0]!.id, correlationId, metadata: { version: v, weights: parsed.data } });
    return { id: rows[0]!.id, version: v, weights: parsed.data };
  });
}

const fmtScale = (v: unknown) => (v == null ? null : Number(v));

/** 2–4 candidates side by side. The snapshot is stored once and becomes the target for interpretation. */
export async function compareCandidates(viewer: Viewer, projectId: string, findingId: string, ids: string[], correlationId: string) {
  await can(viewer, "project.read", projectId);
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 4) throw badRequest("Pilih 2–4 kandidat");
  const rows = (await db().query(`SELECT ${CANDIDATE_COLS}, l.finding_id AS "findingId" FROM ${CANDIDATE_FROM} WHERE l.project_id = $1 AND l.finding_id = $2 AND l.id = ANY($3::uuid[])`, [projectId, findingId, unique])).rows;
  if (rows.length !== unique.length) throw notFound();
  if (rows.some((r) => !r.validationId)) throw conflict("Semua kandidat harus sudah divalidasi");
  const f = (await db().query("SELECT id, title, type, metrics, summary FROM findings WHERE id = $1", [findingId])).rows[0];
  const ordered = unique.map((id) => rows.find((r) => r.id === id)!);
  const payload = {
    finding: { id: f.id, title: f.title, type: f.type, summary: f.summary },
    candidates: ordered.map((r) => ({
      linkId: r.id, candidateType: r.candidateType, candidateId: r.candidateId, candidateKey: r.candidateKey, candidateVersion: r.candidateVersion, origin: r.origin,
      status: r.status, stale: r.stale, validationId: r.validationId, assessmentId: r.assessmentId, scoreId: r.scoreId, evidenceBundleId: r.evidenceBundleId,
      rows: {
        addressedProblem: { value: r.addressedProblem ?? f.title, source: r.candidateType === "analyst" ? `analyst_candidate:${r.candidateId}` : `finding:${f.id}` },
        magnitude: { value: r.components?.problemMagnitude?.value ?? null, source: r.components?.problemMagnitude?.source ?? null },
        relevance: { value: r.correctedConclusion ?? r.conclusion ?? null, score: r.totalScore ?? null, source: r.assessmentId ? `assessment:${r.assessmentId}` : null },
        evidenceConfidence: { value: r.components?.evidenceConfidence?.value ?? null, source: r.components?.evidenceConfidence?.source ?? null },
        prerequisites: { value: r.payload?.prerequisites ?? [], source: `${r.candidateType}:${r.candidateId}` },
        owner: { value: r.payload?.ownerRole || null, source: `${r.candidateType}:${r.candidateId}` },
        effort: { value: fmtScale(r.payload?.effort), source: `${r.candidateType}:${r.candidateId}` },
        risk: { value: fmtScale(r.payload?.risk), source: `${r.candidateType}:${r.candidateId}` },
        exclusions: { value: r.payload?.exclusions ?? [], source: `${r.candidateType}:${r.candidateId}` },
        missingInformation: { value: [...(r.missing ?? []), ...((r.checks as { status: string; reason: string }[]).filter((c) => c.status === "not_evaluable").map((c) => c.reason))], source: `validation:${r.validationId}` },
        successMetric: { value: r.payload?.successMetric || null, source: `${r.candidateType}:${r.candidateId}` },
        priority: { value: r.score, rank: r.rank, partial: r.partial, policyVersion: r.policyVersion, source: `score:${r.scoreId}` },
      },
      action: r.action,
    })),
  };
  const hash = createHash("sha256").update(stableStringify({ findingId, links: unique, validations: ordered.map((r) => r.validationId), scores: ordered.map((r) => r.scoreId), assessments: ordered.map((r) => r.assessmentId) })).digest("hex");
  const existing = (await db().query<{ id: string; created_at: string }>("SELECT id, created_at FROM candidate_comparisons WHERE project_id = $1 AND hash = $2", [projectId, hash])).rows[0];
  if (existing) return { id: existing.id, createdAt: existing.created_at, ...payload };
  const created = await withTx(async (tx) => {
    const { rows: [c] } = await tx.query<{ id: string; created_at: string }>(
      `INSERT INTO candidate_comparisons (project_id, finding_id, hash, candidate_link_ids, validation_ids, assessment_ids, score_ids, bundle_ids, payload, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (project_id, hash) DO UPDATE SET hash = EXCLUDED.hash RETURNING id, created_at`,
      [projectId, findingId, hash, unique, ordered.map((r) => r.validationId), ordered.map((r) => r.assessmentId).filter(Boolean), ordered.map((r) => r.scoreId), ordered.map((r) => r.evidenceBundleId).filter(Boolean), JSON.stringify(payload), viewer.id],
    );
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.compare", objectType: "candidate_comparison", objectId: c!.id, correlationId, metadata: { findingId, candidates: unique.length } });
    return c!;
  });
  return { id: created.id, createdAt: created.created_at, ...payload };
}
