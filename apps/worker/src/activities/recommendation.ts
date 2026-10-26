import { ApplicationFailure } from "@temporalio/activity";
import { AuthzError } from "@nora/authz";
import { jsonAs, toJson } from "@nora/db";
import { Condition, DEFAULT_PRIORITY_WEIGHTS, finalValidationStatus, normalizeFiveScale, priorityScore, PriorityWeights, type ValidationStatus } from "@nora/contracts";
import { audit, authorizeUser, db, staleOutboxEvents, withTx } from "../db.ts";
import { candidatePayload } from "./assessment.ts";

export interface RefreshJob { projectId: string; findingId: string; candidateSetId: string; requestedBy: string; correlationId: string }

export async function startRefresh(job: RefreshJob): Promise<{ assessmentRunId: string }> {
  try {
    await authorizeUser(job.requestedBy, "recommendation.write", job.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable(`authorization failed: ${err.code}`, "Unauthorized");
    throw err;
  }
  await db().candidateSet.updateMany({ where: { id: job.candidateSetId }, data: { status: "validating" } });
  const run = await db().assessmentRun.create({ data: { projectId: job.projectId, findingId: job.findingId, trigger: "recommendation_refresh", requestedBy: job.requestedBy }, select: { id: true } });
  return { assessmentRunId: run.id };
}

interface Check { key: string; status: "pass" | "fail" | "not_evaluable"; failure: ValidationStatus | null; reason: string; details?: Record<string, unknown> }

/** Measured problem size from the finding's own metrics (0..1); never a predicted saving. */
function magnitude(type: string, m: Record<string, number | null | undefined>): number | null {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  switch (type) {
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
  const f = await db().finding.findUniqueOrThrow({
    where: { id: job.findingId },
    select: {
      id: true, type: true, metrics: true, analysisRunId: true, datasetVersionId: true, contextPackageId: true, _count: { select: { findingCases: true } },
      contextPackage: { select: { status: true } }, datasetVersion: { select: { status: true, capabilityMatrix: { select: { capabilities: true } } } },
    },
  });
  const metrics = jsonAs<Record<string, number | null>>(f.metrics);
  const caseCount = f._count.findingCases;
  const pkgActive = f.contextPackage.status === "active";
  const dsPublished = f.datasetVersion.status === "published";
  const runMetrics = new Set((await db().analysisMetric.findMany({ where: { runId: f.analysisRunId, available: true }, select: { metricKey: true } })).map((r) => r.metricKey));
  const caps = jsonAs<Record<string, { available?: boolean }>>(f.datasetVersion.capabilityMatrix?.capabilities ?? {});
  const graphStale = (await staleOutboxEvents(db(), job.projectId)) > 0;
  const policy = await db().priorityPolicy.findFirst({ where: { projectId: job.projectId }, orderBy: { version: "desc" }, select: { id: true, version: true, weights: true } });
  const weights = policy ? PriorityWeights.parse(policy.weights) : DEFAULT_PRIORITY_WEIGHTS;
  const links = await db().candidateLink.findMany({ where: { projectId: job.projectId, findingId: job.findingId }, orderBy: { candidateKey: "asc" } });
  const planned: {
    linkId: string; checks: Check[]; status: ValidationStatus; assessmentId: string | null; bundleId: string | null;
    components: Record<string, number | null>; sources: Record<string, string | null>; ps: ReturnType<typeof priorityScore>;
  }[] = [];

  for (const link of links) {
    const cand = await candidatePayload(link);
    const checks: Check[] = [];
    const pre = link.preconditionStatus;
    const preChecks = jsonAs<{ status: string; reason: string }[]>(link.preconditionChecks);
    checks.push({ key: "applicability", status: pre === "eligible" ? "pass" : pre === "not_eligible" ? "fail" : "not_evaluable", failure: pre === "eligible" ? null : pre === "not_eligible" ? "not_eligible" : "insufficient_information",
      reason: pre === "eligible" ? "Semua syarat penerapan terpenuhi" : preChecks.filter((c) => c.status !== "pass").map((c) => c.reason).join("; ") || "Syarat tidak dapat dihitung", details: { checks: preChecks } });

    const metricRefs = cand.conditions.map((c) => Condition.parse(c)).filter((c) => c.ref === "metric").map((c) => c.key);
    const missingMetrics = metricRefs.filter((k) => !(k in metrics) && !runMetrics.has(k));
    checks.push({ key: "referenced_metrics", status: missingMetrics.length ? "fail" : "pass", failure: missingMetrics.length ? "needs_review" : null, reason: missingMetrics.length ? `Metrik tidak ada pada run: ${missingMetrics.join(", ")}` : metricRefs.length ? "Metrik rujukan tersedia pada run" : "Tidak merujuk metrik" });

    let versionOk = true, versionReason = "Versi kandidat aktif pada paket konteks";
    if (link.candidateType === "intervention") {
      const ref = await db().contextPackageRef.findFirst({ where: { packageId: f.contextPackageId, refId: link.candidateId }, select: { refVersion: true } });
      if (!ref) { versionOk = false; versionReason = "Kandidat tidak tercatat pada paket konteks temuan"; }
      else if (!pkgActive) { versionOk = false; versionReason = "Paket konteks temuan sudah digantikan"; }
    } else if (!pkgActive) { versionOk = false; versionReason = "Paket konteks temuan sudah digantikan"; }
    checks.push({ key: "source_versions", status: versionOk ? "pass" : "fail", failure: versionOk ? null : "needs_review", reason: versionReason });

    const missingCaps = cand.requiredCapabilities.filter((c) => !caps[c]?.available);
    checks.push({ key: "capability", status: missingCaps.length ? "not_evaluable" : "pass", failure: missingCaps.length ? "insufficient_information" : null, reason: missingCaps.length ? `Kapabilitas data tidak tersedia: ${missingCaps.join(", ")}` : "Kapabilitas data tersedia" });

    checks.push({ key: "owner_authority", status: cand.ownerRole.trim() ? "pass" : "fail", failure: cand.ownerRole.trim() ? null : "needs_review", reason: cand.ownerRole.trim() ? `Pemilik: ${cand.ownerRole}` : "Peran pemilik belum ditetapkan" });

    const a = await db().assessment.findFirst({
      where: { candidateLinkId: link.id, status: { not: "failed" } }, orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, conclusion: true, totalScore: true, topProbability: true, evidenceBundleId: true,
        evidenceBundle: { select: { contextMaybeStale: true } },
        assessmentCorrections: { orderBy: { createdAt: "desc" }, select: { kind: true, conclusion: true } },
      },
    });
    const reviewKind = a?.assessmentCorrections[0]?.kind ?? null;
    const corrected = a?.assessmentCorrections.find((x) => x.kind === "correct")?.conclusion ?? null;
    const effective = corrected ?? a?.conclusion ?? null;
    let jev: Check;
    if (pre !== "eligible") jev = { key: "jev_assessment", status: "not_evaluable", failure: null, reason: "Tidak dinilai karena syarat penerapan" };
    else if (!a) jev = { key: "jev_assessment", status: "not_evaluable", failure: "needs_review", reason: "Penilaian Jev belum tersedia atau gagal" };
    else if (a.status === "needs_review" && !reviewKind) jev = { key: "jev_assessment", status: "fail", failure: "needs_review", reason: "Penilaian Jev perlu review analis" };
    else if (effective === "insufficient_information" || a.status === "insufficient_information") jev = { key: "jev_assessment", status: "not_evaluable", failure: "insufficient_information", reason: "Bukti tidak cukup menurut Jev" };
    else if (effective === "relevant" || effective === "partly_relevant") jev = { key: "jev_assessment", status: "pass", failure: null, reason: `Relevansi: ${effective}${reviewKind ? " (ditinjau analis)" : ""}` };
    else jev = { key: "jev_assessment", status: "fail", failure: "needs_review", reason: `Relevansi: ${effective ?? "tidak diketahui"}` };
    checks.push({ ...jev, details: { assessmentId: a?.id ?? null } });

    const stale = graphStale || !!a?.evidenceBundle?.contextMaybeStale || !dsPublished;
    checks.push({ key: "evidence_freshness", status: stale ? "fail" : "pass", failure: stale ? "needs_review" : null, reason: stale ? (!dsPublished ? "Dataset temuan sudah digantikan" : "Graph/paket bukti mungkin usang") : "Bukti terkini" });

    const status = finalValidationStatus(checks.map((c) => c.failure));
    const relevance = a?.totalScore ?? null;
    const confidence = a?.topProbability != null ? Math.round(a.topProbability * Math.min(1, caseCount / 30) * 10_000) / 10_000 : null;
    const components = { relevance: effective === "not_relevant" ? 0 : relevance, problemMagnitude: magnitude(f.type, metrics), evidenceConfidence: confidence, effort: normalizeFiveScale(cand.effort), risk: normalizeFiveScale(cand.risk) };
    const ps = priorityScore(components, weights);
    const sources = {
      relevance: a ? `assessment:${a.id}` : null, problemMagnitude: `finding:${f.id}`, evidenceConfidence: a ? `assessment:${a.id} × kasus pendukung` : null,
      effort: cand.effort != null ? `${link.candidateType}:${link.candidateId}` : null, risk: cand.risk != null ? `${link.candidateType}:${link.candidateId}` : null,
    };
    planned.push({ linkId: link.id, checks, status, assessmentId: a?.id ?? null, bundleId: a?.evidenceBundleId ?? null, components, sources, ps });
  }

  // Rank by score among candidates that are not ineligible, then store everything in one transaction.
  const ranked = planned.filter((p) => p.status !== "not_eligible" && p.ps.score != null).sort((x, y) => y.ps.score! - x.ps.score! || x.linkId.localeCompare(y.linkId));
  const rankOf = new Map(ranked.map((p, i) => [p.linkId, i + 1]));
  await withTx(async (tx) => {
    for (const p of planned) {
      const v = await tx.candidateValidation.create({
        data: {
          projectId: job.projectId, candidateSetId: job.candidateSetId, candidateLinkId: p.linkId, status: p.status, datasetVersionId: f.datasetVersionId,
          contextPackageId: f.contextPackageId, assessmentId: p.assessmentId, evidenceBundleId: p.bundleId,
        },
        select: { id: true },
      });
      await tx.validationCheck.createMany({
        data: p.checks.map((c) => ({ validationId: v.id, checkKey: c.key, status: c.status, failureStatus: c.failure, reason: c.reason, details: toJson(c.details ?? {}) })),
      });
      await tx.candidateScore.create({
        data: {
          projectId: job.projectId, validationId: v.id, policyId: policy?.id ?? null, policyVersion: policy?.version ?? 0, weights,
          components: toJson(Object.fromEntries(Object.entries(p.components).map(([k, val]) => [k, { value: val, source: p.sources[k as keyof typeof p.sources] }]))),
          missing: p.ps.missing, partial: p.ps.partial, score: p.status === "not_eligible" ? null : p.ps.score, rank: rankOf.get(p.linkId) ?? null,
        },
      });
      await tx.candidateLink.update({ where: { id: p.linkId }, data: { latestStatus: p.status } });
    }
  });
  const validated = planned.filter((p) => p.status === "validated").length;
  await db().candidateSet.updateMany({ where: { id: job.candidateSetId }, data: { status: "completed", completedAt: new Date() } });
  await audit(db(), { projectId: job.projectId, actorId: job.requestedBy, action: "recommendation.validate", objectType: "candidate_set", objectId: job.candidateSetId, correlationId: job.correlationId,
    metadata: { candidates: planned.length, validated } });
  return { validated };
}

export async function failRefresh(job: RefreshJob & { message: string }): Promise<void> {
  await db().candidateSet.updateMany({ where: { id: job.candidateSetId }, data: { status: "failed", errorMessage: job.message.slice(0, 500), completedAt: new Date() } });
}
