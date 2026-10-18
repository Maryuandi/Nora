import "server-only";
import { createHash } from "node:crypto";
import { AnalystCandidateInput, DEFAULT_PRIORITY_WEIGHTS, PriorityWeights, stableStringify } from "@nora/contracts";
import { isUniqueViolation, jsonAs, type Prisma } from "@nora/db";
import type { PreconditionCheck } from "./assessments";
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
  const groups = await db().candidateLink.groupBy({ by: ["findingId", "latestStatus"], where: { projectId, findingId: { in: findings.map((f) => f.id) } }, _count: { _all: true } });
  const counts = new Map<string, { total: number; validated: number; review: number }>();
  for (const g of groups) {
    const c = counts.get(g.findingId) ?? { total: 0, validated: 0, review: 0 };
    c.total += g._count._all;
    if (g.latestStatus === "validated") c.validated += g._count._all;
    if (g.latestStatus === "needs_review") c.review += g._count._all;
    counts.set(g.findingId, c);
  }
  return { runId: run, findings: findings.map((f) => ({ ...f, candidates: counts.get(f.id) ?? { total: 0, validated: 0, review: 0 } })) };
}

export async function refreshRecommendations(viewer: Viewer, projectId: string, findingId: string, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const f = await db().finding.findFirst({ where: { id: findingId, projectId }, select: { contextPackageId: true } });
  if (!f) throw notFound();
  const running = await db().candidateSet.findFirst({ where: { findingId, status: { in: ["queued", "validating"] } }, select: { id: true } });
  if (running) return { id: running.id, reused: true };
  const id = await withTx(async (tx) => {
    const { id } = await tx.candidateSet.create({ data: { projectId, findingId, contextPackageId: f.contextPackageId, requestedBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.refresh", objectType: "candidate_set", objectId: id, correlationId, metadata: { findingId } });
    return id;
  });
  await startJob("recommendationRefreshWorkflow", `recommendations-${id}`, [{ projectId, findingId, candidateSetId: id, requestedBy: viewer.id, correlationId }]);
  return { id, reused: false };
}

/** Intervention or analyst payload; the comparison reads these fields. */
export interface CandidatePayload {
  action?: string;
  description?: string;
  prerequisites?: string[];
  exclusions?: string[];
  ownerRole?: string;
  effort?: number | null;
  risk?: number | null;
  successMetric?: string;
  [key: string]: unknown;
}

type Component = { value: number | null; source: string | null };

export interface CandidateRow {
  id: string;
  findingId: string;
  candidateType: string;
  candidateId: string;
  candidateKey: string;
  candidateVersion: number;
  origin: string;
  preconditionStatus: string;
  preconditionChecks: PreconditionCheck[];
  payload: CandidatePayload | null;
  action: string | null;
  addressedProblem: string | null;
  validationId: string | null;
  status: string | null;
  validatedAt: string | null;
  assessmentId: string | null;
  evidenceBundleId: string | null;
  scoreId: string | null;
  score: number | null;
  rank: number | null;
  partial: boolean | null;
  missing: string[] | null;
  components: Record<string, Component> | null;
  policyVersion: number | null;
  weights: PriorityWeights | null;
  /** data, context or assessment moved on since the latest validation; null before any validation */
  stale: boolean | null;
  checks: { key: string; status: string; failureStatus: string | null; reason: string; details: Record<string, unknown> }[];
  conclusion: string | null;
  topProbability: number | null;
  totalScore: number | null;
  assessmentStatus: string | null;
  correctedConclusion: string | null;
}

const LATEST_SCORE = { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, score: true, rank: true, partial: true, missing: true, components: true, policyVersion: true, weights: true } } as const;

const CANDIDATE_SELECT = {
  id: true, findingId: true, candidateType: true, candidateId: true, candidateKey: true, candidateVersion: true, origin: true, preconditionStatus: true, preconditionChecks: true,
  assessments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
  candidateValidations: {
    orderBy: { createdAt: "desc" }, take: 1,
    select: {
      id: true, status: true, createdAt: true, assessmentId: true, evidenceBundleId: true,
      datasetVersion: { select: { status: true } }, contextPackage: { select: { status: true } },
      validationChecks: { orderBy: { checkKey: "asc" }, select: { checkKey: true, status: true, failureStatus: true, reason: true, details: true } },
      candidateScores: LATEST_SCORE,
      assessment: {
        select: {
          conclusion: true, topProbability: true, totalScore: true, status: true,
          assessmentCorrections: { where: { kind: "correct" }, orderBy: { createdAt: "desc" }, take: 1, select: { conclusion: true } },
        },
      },
    },
  },
} as const satisfies Prisma.CandidateLinkSelect;

/** Each candidate link with its latest validation, latest score, assessment and catalog/analyst payload; ranked first. */
async function loadCandidates(where: Prisma.CandidateLinkWhereInput): Promise<CandidateRow[]> {
  const links = await db().candidateLink.findMany({ where, select: CANDIDATE_SELECT });
  const ids = (type: string) => links.filter((l) => l.candidateType === type).map((l) => l.candidateId);
  const [interventions, analyst] = await Promise.all([
    db().intervention.findMany({ where: { id: { in: ids("intervention") } }, select: { id: true, payload: true } }),
    db().analystCandidate.findMany({ where: { id: { in: ids("analyst") } }, select: { id: true, payload: true, addressedProblem: true } }),
  ]);
  const rows = links.map(({ assessments: [lastAssessment], candidateValidations: [v], preconditionChecks, ...l }): CandidateRow => {
    const iv = l.candidateType === "intervention" ? interventions.find((i) => i.id === l.candidateId) : undefined;
    const ac = l.candidateType === "analyst" ? analyst.find((a) => a.id === l.candidateId) : undefined;
    const payload = jsonAs<CandidatePayload | null>(iv?.payload ?? ac?.payload ?? null);
    const s = v?.candidateScores[0];
    const a = v?.assessment;
    return {
      ...l, preconditionChecks: jsonAs<CandidateRow["preconditionChecks"]>(preconditionChecks), payload,
      action: (iv ? payload?.action : payload?.description) ?? null, addressedProblem: ac?.addressedProblem ?? null,
      validationId: v?.id ?? null, status: v?.status ?? null, validatedAt: v?.createdAt.toISOString() ?? null, assessmentId: v?.assessmentId ?? null,
      evidenceBundleId: v?.evidenceBundleId ?? null, scoreId: s?.id ?? null, score: s?.score ?? null, rank: s?.rank ?? null, partial: s?.partial ?? null,
      missing: s ? jsonAs<string[]>(s.missing) : null, components: s ? jsonAs<CandidateRow["components"]>(s.components) : null, policyVersion: s?.policyVersion ?? null,
      weights: s ? jsonAs<PriorityWeights>(s.weights) : null,
      stale: v ? v.datasetVersion.status !== "published" || v.contextPackage.status !== "active" || (!!lastAssessment && lastAssessment.createdAt > v.createdAt) : null,
      checks: (v?.validationChecks ?? []).map(({ checkKey, details, ...c }) => ({ key: checkKey, ...c, details: jsonAs<Record<string, unknown>>(details) })),
      conclusion: a?.conclusion ?? null, topProbability: a?.topProbability ?? null, totalScore: a?.totalScore ?? null, assessmentStatus: a?.status ?? null,
      correctedConclusion: a?.assessmentCorrections[0]?.conclusion ?? null,
    };
  });
  return rows.sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity) || x.candidateKey.localeCompare(y.candidateKey));
}

export async function findingRecommendations(viewer: Viewer, projectId: string, findingId: string, statuses?: string[]) {
  await can(viewer, "project.read", projectId);
  const f = await db().finding.findFirst({ where: { id: findingId, projectId }, select: { contextPackageId: true } });
  if (!f) throw notFound();
  const [rows, set, catalogSize] = await Promise.all([
    loadCandidates({ projectId, findingId }),
    db().candidateSet.findFirst({ where: { findingId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, errorMessage: true, createdAt: true, completedAt: true } }),
    db().contextPackageRef.count({ where: { packageId: f.contextPackageId, refType: "intervention" } }),
  ]);
  const filtered = statuses?.length ? rows.filter((r) => r.status && statuses.includes(r.status)) : rows;
  return {
    candidates: filtered, total: rows.length, catalogSize,
    set: set && { ...set, createdAt: set.createdAt.toISOString(), completedAt: set.completedAt?.toISOString() ?? null },
  };
}

export async function getCandidate(viewer: Viewer, projectId: string, linkId: string) {
  await can(viewer, "project.read", projectId);
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw notFound();
  const [row] = await loadCandidates({ id: linkId, projectId });
  if (!row) throw notFound();
  const validations = await db().candidateValidation.findMany({
    where: { candidateLinkId: linkId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, candidateScores: LATEST_SCORE },
  });
  const history = validations.map(({ candidateScores: [s], ...v }) => ({
    ...v, createdAt: v.createdAt.toISOString(), score: s?.score ?? null, rank: s?.rank ?? null, policyVersion: s?.policyVersion ?? null,
  }));
  return { ...row, history };
}

export async function addAnalystCandidate(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const parsed = AnalystCandidateInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Kandidat tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  const c = parsed.data;
  if (!(await db().finding.findFirst({ where: { id: c.findingId, projectId }, select: { id: true } }))) throw notFound();
  return withTx(async (tx) => {
    const payload = { description: c.description, successMetric: c.successMetric, ownerRole: c.ownerRole, effort: c.effort ?? null, risk: c.risk ?? null, prerequisites: c.prerequisites, exclusions: c.exclusions, conditions: c.conditions };
    const { id } = await tx.analystCandidate.create({
      data: { projectId, findingId: c.findingId, payload, addressedProblem: c.addressedProblem, sourceReason: c.sourceReason, createdBy: viewer.id }, select: { id: true },
    });
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.candidate.add", objectType: "analyst_candidate", objectId: id, correlationId, metadata: { findingId: c.findingId } });
    return { id };
  });
}

export async function getPolicy(viewer: Viewer, projectId: string) {
  await can(viewer, "project.read", projectId);
  const row = await db().priorityPolicy.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { id: true, version: true, weights: true } });
  return row ? { ...row, weights: jsonAs<PriorityWeights>(row.weights) } : { id: null, version: 0, weights: DEFAULT_PRIORITY_WEIGHTS };
}

export async function savePolicy(viewer: Viewer, projectId: string, raw: unknown, correlationId: string) {
  await can(viewer, "recommendation.write", projectId);
  const parsed = PriorityWeights.safeParse(raw);
  if (!parsed.success) throw badRequest("Bobot tidak valid", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  return withTx(async (tx) => {
    const max = await tx.priorityPolicy.aggregate({ where: { projectId }, _max: { version: true } });
    const v = (max._max.version ?? 0) + 1;
    const { id } = await tx.priorityPolicy.create({ data: { projectId, version: v, weights: parsed.data, createdBy: viewer.id }, select: { id: true } });
    await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.policy", objectType: "priority_policy", objectId: id, correlationId, metadata: { version: v, weights: parsed.data } });
    return { id, version: v, weights: parsed.data };
  });
}

const fmtScale = (v: unknown) => (v == null ? null : Number(v));

/** 2–4 candidates side by side. The snapshot is stored once and becomes the target for interpretation. */
export async function compareCandidates(viewer: Viewer, projectId: string, findingId: string, ids: string[], correlationId: string) {
  await can(viewer, "project.read", projectId);
  const unique = [...new Set(ids)];
  if (unique.length < 2 || unique.length > 4) throw badRequest("Pilih 2–4 kandidat");
  const rows = await loadCandidates({ projectId, findingId, id: { in: unique } });
  if (rows.length !== unique.length) throw notFound();
  if (rows.some((r) => !r.validationId)) throw conflict("Semua kandidat harus sudah divalidasi");
  const f = await db().finding.findUniqueOrThrow({ where: { id: findingId }, select: { id: true, title: true, type: true, summary: true } });
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
        missingInformation: { value: [...(r.missing ?? []), ...r.checks.filter((c) => c.status === "not_evaluable").map((c) => c.reason)], source: `validation:${r.validationId}` },
        successMetric: { value: r.payload?.successMetric || null, source: `${r.candidateType}:${r.candidateId}` },
        priority: { value: r.score, rank: r.rank, partial: r.partial, policyVersion: r.policyVersion, source: `score:${r.scoreId}` },
      },
      action: r.action,
    })),
  };
  const hash = createHash("sha256").update(stableStringify({ findingId, links: unique, validations: ordered.map((r) => r.validationId), scores: ordered.map((r) => r.scoreId), assessments: ordered.map((r) => r.assessmentId) })).digest("hex");
  const stored = () => db().candidateComparison.findUnique({ where: { projectId_hash: { projectId, hash } }, select: { id: true, createdAt: true } });
  const existing = await stored();
  if (existing) return { id: existing.id, createdAt: existing.createdAt.toISOString(), ...payload };
  const nonNull = (xs: (string | null)[]) => xs.filter((x): x is string => x !== null);
  try {
    const created = await withTx(async (tx) => {
      const c = await tx.candidateComparison.create({
        data: {
          projectId, findingId, hash, candidateLinkIds: unique, validationIds: nonNull(ordered.map((r) => r.validationId)), assessmentIds: nonNull(ordered.map((r) => r.assessmentId)),
          scoreIds: nonNull(ordered.map((r) => r.scoreId)), bundleIds: nonNull(ordered.map((r) => r.evidenceBundleId)), payload, requestedBy: viewer.id,
        },
        select: { id: true, createdAt: true },
      });
      await audit(tx, { projectId, actorId: viewer.id, action: "recommendation.compare", objectType: "candidate_comparison", objectId: c.id, correlationId, metadata: { findingId, candidates: unique.length } });
      return c;
    });
    return { id: created.id, createdAt: created.createdAt.toISOString(), ...payload };
  } catch (err) {
    // A concurrent request stored the same snapshot first; comparisons are immutable, so return that one.
    const winner = isUniqueViolation(err) ? await stored() : null;
    if (!winner) throw err;
    return { id: winner.id, createdAt: winner.createdAt.toISOString(), ...payload };
  }
}
