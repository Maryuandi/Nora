import { ApplicationFailure } from "@temporalio/activity";
import { authorize, AuthzError } from "@nora/authz";
import { withTx } from "@nora/db";
import { Condition, DEFAULT_PRIORITY_WEIGHTS, finalValidationStatus, normalizeFiveScale, priorityScore, PriorityWeights, type ValidationStatus } from "@nora/contracts";
import { audit, db } from "../db.ts";
import { candidatePayload } from "./assessment.ts";

type Row = Record<string, any>;
export interface RefreshJob { projectId: string; findingId: string; candidateSetId: string; requestedBy: string; correlationId: string }

const one = async (sql: string, p: unknown[]): Promise<Row | undefined> => (await db().query(sql, p)).rows[0];
const many = async (sql: string, p: unknown[]): Promise<Row[]> => (await db().query(sql, p)).rows;

export async function startRefresh(job: RefreshJob): Promise<{ assessmentRunId: string }> {
  try {
    await authorize(db(), job.requestedBy, "recommendation.write", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  await db().query("UPDATE candidate_sets SET status = 'validating' WHERE id = $1", [job.candidateSetId]);
  const run = await one("INSERT INTO assessment_runs (project_id, finding_id, trigger, requested_by) VALUES ($1, $2, 'recommendation_refresh', $3) RETURNING id", [job.projectId, job.findingId, job.requestedBy]);
  return { assessmentRunId: run!.id };
}

interface Check { key: string; status: "pass" | "fail" | "not_evaluable"; failure: ValidationStatus | null; reason: string; details?: Record<string, unknown> }

/** Measured problem size from the finding's own metrics (0..1); never a predicted saving. */
function magnitude(f: Row): number | null {
  const m = f.metrics as Record<string, number | null>;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  switch (f.type) {
    case "bottleneck_indication": return m.affectedCaseShare != null && m.contributionShare != null ? clamp(m.affectedCaseShare * m.contributionShare) : null;
    case "high_rework": return m.caseShare != null ? clamp(m.caseShare * Math.min(1, Math.max(0, m.relativeAdditionalDuration ?? 0))) : null;
    case "rule_non_compliance": return m.nonCompliantShare != null ? clamp(m.nonCompliantShare) : null;
    case "bpmn_deviation": return m.fitness != null ? clamp(1 - m.fitness) : null;
    case "aging_backlog": return m.openCases ? clamp((m.agedCases ?? 0) / m.openCases) : null;
    default: return m.relativeChange != null ? clamp(m.relativeChange) : null;
  }
}

/** Deterministic checks for every candidate of the finding; the same inputs give the same checks and score. */
export async function validateCandidates(job: RefreshJob): Promise<{ validated: number }> {
  const f = (await one(`SELECT f.*, (SELECT count(*) FROM finding_cases c WHERE c.finding_id = f.id)::int AS case_count FROM findings f WHERE f.id = $1`, [job.findingId]))!;
  const pkg = (await one("SELECT status FROM context_packages WHERE id = $1", [f.context_package_id]))!;
  const ds = (await one("SELECT status FROM dataset_versions WHERE id = $1", [f.dataset_version_id]))!;
  const runMetrics = new Set((await many("SELECT metric_key FROM analysis_metrics WHERE run_id = $1 AND available", [f.analysis_run_id])).map((r) => r.metric_key));
  const caps = (await one("SELECT capabilities FROM capability_matrix WHERE dataset_version_id = $1", [f.dataset_version_id]))?.capabilities ?? {};
  const graphStale = Number((await one(
    `SELECT count(*) AS n FROM outbox_events WHERE project_id = $1 AND projected_at IS NULL AND NOT dead_letter AND occurred_at < now() - interval '30 seconds'`, [job.projectId],
  ))!.n) > 0;
  const policy = await one("SELECT id, version, weights FROM priority_policies WHERE project_id = $1 ORDER BY version DESC LIMIT 1", [job.projectId]);
  const weights = policy ? PriorityWeights.parse(policy.weights) : DEFAULT_PRIORITY_WEIGHTS;
  const planned: { link: Row; checks: Check[]; status: ValidationStatus; a: Row | undefined; components: Record<string, number | null>; sources: Record<string, string | null>; ps: ReturnType<typeof priorityScore> }[] = [];

  for (const link of await many("SELECT * FROM candidate_links WHERE project_id = $1 AND finding_id = $2 ORDER BY candidate_key", [job.projectId, job.findingId])) {
    const cand = await candidatePayload(link);
    const checks: Check[] = [];
    const pre = link.precondition_status as string;
    checks.push({ key: "applicability", status: pre === "eligible" ? "pass" : pre === "not_eligible" ? "fail" : "not_evaluable", failure: pre === "eligible" ? null : pre === "not_eligible" ? "not_eligible" : "insufficient_information",
      reason: pre === "eligible" ? "Semua syarat penerapan terpenuhi" : (link.precondition_checks as Row[]).filter((c) => c.status !== "pass").map((c) => c.reason).join("; ") || "Syarat tidak dapat dihitung", details: { checks: link.precondition_checks } });

    const metricRefs = cand.conditions.map((c) => Condition.parse(c)).filter((c) => c.ref === "metric").map((c) => c.key);
    const missingMetrics = metricRefs.filter((k) => !(k in (f.metrics as Row)) && !runMetrics.has(k));
    checks.push({ key: "referenced_metrics", status: missingMetrics.length ? "fail" : "pass", failure: missingMetrics.length ? "needs_review" : null, reason: missingMetrics.length ? `Metrik tidak ada pada run: ${missingMetrics.join(", ")}` : metricRefs.length ? "Metrik rujukan tersedia pada run" : "Tidak merujuk metrik" });

    let versionOk = true, versionReason = "Versi kandidat aktif pada paket konteks";
    if (link.candidate_type === "intervention") {
      const ref = await one("SELECT ref_version FROM context_package_refs WHERE package_id = $1 AND ref_id = $2", [f.context_package_id, link.candidate_id]);
      if (!ref) { versionOk = false; versionReason = "Kandidat tidak tercatat pada paket konteks temuan"; }
      else if (pkg.status !== "active") { versionOk = false; versionReason = "Paket konteks temuan sudah digantikan"; }
    } else if (pkg.status !== "active") { versionOk = false; versionReason = "Paket konteks temuan sudah digantikan"; }
    checks.push({ key: "source_versions", status: versionOk ? "pass" : "fail", failure: versionOk ? null : "needs_review", reason: versionReason });

    const missingCaps = cand.requiredCapabilities.filter((c) => !caps[c]?.available);
    checks.push({ key: "capability", status: missingCaps.length ? "not_evaluable" : "pass", failure: missingCaps.length ? "insufficient_information" : null, reason: missingCaps.length ? `Kapabilitas data tidak tersedia: ${missingCaps.join(", ")}` : "Kapabilitas data tersedia" });

    checks.push({ key: "owner_authority", status: cand.ownerRole.trim() ? "pass" : "fail", failure: cand.ownerRole.trim() ? null : "needs_review", reason: cand.ownerRole.trim() ? `Pemilik: ${cand.ownerRole}` : "Peran pemilik belum ditetapkan" });

    const a = await one(
      `SELECT a.*, (SELECT x.kind FROM assessment_corrections x WHERE x.assessment_id = a.id ORDER BY x.created_at DESC LIMIT 1) AS review_kind,
              (SELECT x.conclusion FROM assessment_corrections x WHERE x.assessment_id = a.id AND x.kind = 'correct' ORDER BY x.created_at DESC LIMIT 1) AS corrected
         FROM assessments a WHERE a.candidate_link_id = $1 AND a.status <> 'failed' ORDER BY a.created_at DESC LIMIT 1`, [link.id],
    );
    const effective = a?.corrected ?? a?.conclusion ?? null;
    let jev: Check;
    if (pre !== "eligible") jev = { key: "jev_assessment", status: "not_evaluable", failure: null, reason: "Tidak dinilai karena syarat penerapan" };
    else if (!a) jev = { key: "jev_assessment", status: "not_evaluable", failure: "needs_review", reason: "Penilaian Jev belum tersedia atau gagal" };
    else if (a.status === "needs_review" && !a.review_kind) jev = { key: "jev_assessment", status: "fail", failure: "needs_review", reason: "Penilaian Jev perlu review analis" };
    else if (effective === "insufficient_information" || a.status === "insufficient_information") jev = { key: "jev_assessment", status: "not_evaluable", failure: "insufficient_information", reason: "Bukti tidak cukup menurut Jev" };
    else if (effective === "relevant" || effective === "partly_relevant") jev = { key: "jev_assessment", status: "pass", failure: null, reason: `Relevansi: ${effective}${a.review_kind ? " (ditinjau analis)" : ""}` };
    else jev = { key: "jev_assessment", status: "fail", failure: "needs_review", reason: `Relevansi: ${effective ?? "tidak diketahui"}` };
    checks.push({ ...jev, details: { assessmentId: a?.id ?? null } });

    const bundle = a?.evidence_bundle_id ? await one("SELECT context_maybe_stale FROM evidence_bundles WHERE id = $1", [a.evidence_bundle_id]) : null;
    const stale = graphStale || !!bundle?.context_maybe_stale || ds.status !== "published";
    checks.push({ key: "evidence_freshness", status: stale ? "fail" : "pass", failure: stale ? "needs_review" : null, reason: stale ? (ds.status !== "published" ? "Dataset temuan sudah digantikan" : "Graph/paket bukti mungkin usang") : "Bukti terkini" });

    const status = finalValidationStatus(checks.map((c) => c.failure));
    const relevance = a?.total_score ?? null;
    const confidence = a?.top_probability != null ? Math.round(a.top_probability * Math.min(1, f.case_count / 30) * 10_000) / 10_000 : null;
    const components = { relevance: effective === "not_relevant" ? 0 : relevance, problemMagnitude: magnitude(f), evidenceConfidence: confidence, effort: normalizeFiveScale(cand.effort), risk: normalizeFiveScale(cand.risk) };
    const ps = priorityScore(components, weights);
    const sources = {
      relevance: a ? `assessment:${a.id}` : null, problemMagnitude: `finding:${f.id}`, evidenceConfidence: a ? `assessment:${a.id} × kasus pendukung` : null,
      effort: cand.effort != null ? `${link.candidate_type}:${link.candidate_id}` : null, risk: cand.risk != null ? `${link.candidate_type}:${link.candidate_id}` : null,
    };

    planned.push({ link, checks, status, a, components, sources, ps });
  }

  // Rank by score among candidates that are not ineligible, then store everything in one transaction.
  const ranked = planned.filter((p) => p.status !== "not_eligible" && p.ps.score != null).sort((x, y) => y.ps.score! - x.ps.score! || x.link.id.localeCompare(y.link.id));
  const rankOf = new Map(ranked.map((p, i) => [p.link.id, i + 1]));
  await withTx(db(), async (tx) => {
    for (const p of planned) {
      const v = (await tx.query(
        `INSERT INTO candidate_validations (project_id, candidate_set_id, candidate_link_id, status, dataset_version_id, context_package_id, assessment_id, evidence_bundle_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [job.projectId, job.candidateSetId, p.link.id, p.status, f.dataset_version_id, f.context_package_id, p.a?.id ?? null, p.a?.evidence_bundle_id ?? null],
      )).rows[0].id as string;
      for (const c of p.checks) {
        await tx.query("INSERT INTO validation_checks (validation_id, check_key, status, failure_status, reason, details) VALUES ($1, $2, $3, $4, $5, $6)",
          [v, c.key, c.status, c.failure, c.reason, JSON.stringify(c.details ?? {})]);
      }
      await tx.query(
        `INSERT INTO candidate_scores (project_id, validation_id, policy_id, policy_version, weights, components, missing, partial, score, rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [job.projectId, v, policy?.id ?? null, policy?.version ?? 0, JSON.stringify(weights),
          JSON.stringify(Object.fromEntries(Object.entries(p.components).map(([k, val]) => [k, { value: val, source: p.sources[k as keyof typeof p.sources] }]))),
          JSON.stringify(p.ps.missing), p.ps.partial, p.status === "not_eligible" ? null : p.ps.score, rankOf.get(p.link.id) ?? null],
      );
      await tx.query("UPDATE candidate_links SET latest_status = $2 WHERE id = $1", [p.link.id, p.status]);
    }
  });
  const results = planned.map((p) => ({ status: p.status }));
  await db().query("UPDATE candidate_sets SET status = 'completed', completed_at = now() WHERE id = $1", [job.candidateSetId]);
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "recommendation.validate", objectType: "candidate_set", objectId: job.candidateSetId, correlationId: job.correlationId,
    metadata: { candidates: results.length, validated: results.filter((r) => r.status === "validated").length } });
  return { validated: results.filter((r) => r.status === "validated").length };
}

export async function failRefresh(job: RefreshJob & { message: string }): Promise<void> {
  await db().query("UPDATE candidate_sets SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [job.candidateSetId, job.message.slice(0, 500)]);
}
