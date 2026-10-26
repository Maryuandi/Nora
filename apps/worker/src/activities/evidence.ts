import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { AuthzError } from "@nora/authz";
import { jsonAs } from "@nora/db";
import { EVIDENCE_ALGORITHM_VERSION, EvidenceBundleRequest, stableStringify, type EvidenceBundle, type EvidenceItem, type MappingConfig } from "@nora/contracts";
import { neighborhood } from "@nora/graph";
import { putJson } from "@nora/storage";
import type { FindingSubject } from "../conditions.ts";
import { audit, authorizeUser, db, staleOutboxEvents, withTx } from "../db.ts";

export interface Candidate {
  itemType: string;
  itemId: string;
  itemVersion: string | null;
  priority: number;
  /** graph node this item corresponds to, used for distance ranking */
  graphRef?: { type: string; id: string };
  content: Record<string, unknown>;
  /** record exists but must not be used (superseded, not approved, …) */
  excludedReason?: string;
}

/** Downstream outputs do not move the graph version; their influence on a bundle shows up in item content hashes. */
const OUTPUT_AGGREGATES = ["evidence_bundles", "assessments", "assessment_corrections", "interpretations", "candidate_comparisons"];
const tokens = (c: unknown) => Math.ceil(JSON.stringify(c).length / 4);
const num = (v: bigint | null) => (v == null ? null : Number(v));

/** Catalog fields the evidence reads from context payloads. */
interface Payload {
  name?: string; params?: unknown; statement?: string; symptoms?: string[]; requiredEvidence?: string[]; findingTypes?: string[]; activities?: string[];
  action?: string; prerequisites?: string[]; successMetric?: string;
}

const UNIT = (k: string) => (/Seconds$/.test(k) ? "seconds" : /(Share|Excess|fitness|Change)$/i.test(k) ? "ratio" : /(Count|Cases|Variants|compliant|nonCompliant|notEvaluable|occurrences|rank)$/i.test(k) ? "count" : "number");

/** Ids of one ref type in a context package. */
async function packageRefIds(packageId: string, refType: string) {
  return (await db().contextPackageRef.findMany({ where: { packageId, refType }, select: { refId: true } })).map((r) => r.refId);
}

/** Measured finding facts, provenance, context and catalog, in priority order (1 = most important). */
export async function findingCandidates(projectId: string, findingId: string, purpose: string): Promise<Candidate[]> {
  const f = await db().finding.findFirst({ where: { id: findingId, projectId } });
  if (!f) throw ApplicationFailure.nonRetryable("finding not found in project", "NotFound");
  const subject = jsonAs<FindingSubject>(f.subject);
  const out: Candidate[] = [];
  const F = { type: "Finding", id: findingId };
  out.push({ itemType: "finding", itemId: findingId, itemVersion: null, priority: 1, graphRef: F, content: { title: f.title, findingType: f.type, summary: f.summary, severityScore: f.severityScore, severityLabel: f.severityLabel, population: f.population, thresholds: f.thresholds } });
  for (const [k, v] of Object.entries(jsonAs<Record<string, unknown>>(f.metrics))) {
    if (v == null) continue;
    out.push({ itemType: "metric_value", itemId: `${findingId}:${k}`, itemVersion: `${f.metricKey}@${f.metricVersion}`, priority: 1, graphRef: F, content: { metric: k, value: v, unit: UNIT(k), metricKey: f.metricKey, metricVersion: f.metricVersion } });
  }
  const md = await db().metricDefinition.findUnique({ where: { key_version: { key: f.metricKey, version: f.metricVersion } } });
  if (md) out.push({ itemType: "metric_definition", itemId: `${md.key}:v${md.version}`, itemVersion: String(md.version), priority: 1, graphRef: { type: "MetricDefinition", id: `${md.key}:v${md.version}` }, content: { name: md.name, formula: md.formula, population: md.population, unit: md.unit } });

  const run = await db().analysisRun.findUniqueOrThrow({ where: { id: f.analysisRunId }, select: { id: true, algorithmVersion: true, filterSpec: true, coverage: true } });
  out.push({ itemType: "analysis", itemId: run.id, itemVersion: run.algorithmVersion, priority: 2, graphRef: { type: "Analysis", id: run.id }, content: { filter: run.filterSpec, coverage: run.coverage, algorithm: run.algorithmVersion } });
  const ds = await db().datasetVersion.findUniqueOrThrow({
    where: { id: f.datasetVersionId },
    include: { mappingVersion: { select: { version: true, config: true } }, snapshot: { select: { fileName: true, sha256: true } }, capabilityMatrix: { select: { capabilities: true } } },
  });
  const config = jsonAs<Partial<MappingConfig>>(ds.mappingVersion.config);
  out.push({ itemType: "dataset_version", itemId: ds.id, itemVersion: String(ds.version), priority: 2, graphRef: { type: "DatasetVersion", id: ds.id }, content: { name: ds.name, contentHash: ds.contentHash, qualityStatus: ds.qualityStatus, events: num(ds.eventCount), cases: num(ds.caseCount), excludedEvents: num(ds.excludedEventCount), status: ds.status } });
  out.push({ itemType: "mapping_version", itemId: ds.mappingVersionId, itemVersion: String(ds.mappingVersion.version), priority: 2, graphRef: { type: "MappingVersion", id: ds.mappingVersionId }, content: { labelRules: Object.keys(config.labelMap ?? {}).length, repairRules: config.repairRules ?? [] } });
  out.push({ itemType: "snapshot", itemId: ds.snapshotId, itemVersion: null, priority: 2, graphRef: { type: "Snapshot", id: ds.snapshotId }, content: { fileName: ds.snapshot.fileName, sha256: ds.snapshot.sha256 } });
  if (ds.capabilityMatrix) out.push({ itemType: "capability_matrix", itemId: ds.id, itemVersion: String(ds.version), priority: 2, graphRef: { type: "DatasetVersion", id: ds.id }, content: jsonAs<Record<string, unknown>>(ds.capabilityMatrix.capabilities) });
  const pkg = await db().contextPackage.findUniqueOrThrow({ where: { id: f.contextPackageId } });
  out.push({ itemType: "context_package", itemId: pkg.id, itemVersion: String(pkg.version), priority: 2, graphRef: { type: "ContextPackage", id: pkg.id }, content: { name: pkg.name, hash: pkg.hash, conformanceAvailable: pkg.conformanceAvailable } });

  // Context: the rule a finding was evaluated against comes first; document excerpts only, never whole documents.
  const rules = await db().rule.findMany({
    where: { id: { in: await packageRefIds(pkg.id, "rule") } }, orderBy: { itemKey: "asc" },
    include: { sourceDocument: { select: { id: true, title: true, reference: true, excerpt: true } } },
  });
  for (const r of rules) {
    const isSubject = subject.ruleId === r.id;
    const payload = jsonAs<Payload>(r.payload);
    out.push({ itemType: "rule", itemId: r.id, itemVersion: String(r.version), priority: isSubject ? 2 : 4, graphRef: { type: "Rule", id: r.id }, content: { name: payload.name, params: payload.params, sourceReference: r.sourceReference } });
    const doc = r.sourceDocument;
    if (doc && doc.excerpt) out.push({ itemType: "document_excerpt", itemId: doc.id, itemVersion: String(r.version), priority: isSubject ? 3 : 5, graphRef: { type: "Document", id: doc.id }, content: { title: doc.title, reference: doc.reference, excerpt: doc.excerpt.slice(0, 1200) } });
  }
  if (f.type === "high_rework" && pkg.reworkDefinitionId) {
    const rw = await db().reworkDefinition.findUniqueOrThrow({ where: { id: pkg.reworkDefinitionId } });
    out.push({ itemType: "rework_definition", itemId: rw.id, itemVersion: String(rw.version), priority: 2, graphRef: { type: "ReworkDefinition", id: rw.id }, content: jsonAs<Record<string, unknown>>(rw.payload) });
  }
  if (f.type === "bpmn_deviation") {
    const c = await db().conformanceResult.findUnique({ where: { runId: run.id }, select: { fitness: true, mismatches: true, mappingVersion: true } });
    if (c) out.push({ itemType: "conformance_summary", itemId: run.id, itemVersion: String(c.mappingVersion), priority: 2, graphRef: { type: "Analysis", id: run.id }, content: { fitness: c.fitness, mismatches: jsonAs<unknown[]>(c.mismatches).slice(0, 10) } });
  }

  // Supporting cases: pseudonymous case_uid and measured values only (no case ids, resources, or attributes).
  const support = await db().findingCase.findMany({ where: { findingId }, orderBy: { rank: "asc" }, take: 5, select: { caseUid: true, supportMetric: true, supportValue: true } });
  const caseRows = await db().analysisCase.findMany({ where: { runId: run.id, caseUid: { in: support.map((c) => c.caseUid) } }, select: { caseUid: true, durationS: true, eventCount: true } });
  for (const c of support) {
    const a = caseRows.find((x) => x.caseUid === c.caseUid);
    out.push({ itemType: "case_summary", itemId: c.caseUid, itemVersion: null, priority: 4, graphRef: { type: "CaseRef", id: c.caseUid }, content: { caseRef: c.caseUid, [c.supportMetric]: c.supportValue, durationSeconds: a?.durationS ?? null, events: a?.eventCount ?? null } });
  }

  // Catalog: hypotheses stay labelled unproven; interventions and rubric matter for assessment.
  const acts = [subject.from, subject.to].filter((a): a is string => !!a);
  for (const h of await db().hypothesis.findMany({ where: { id: { in: await packageRefIds(pkg.id, "hypothesis") } }, orderBy: { itemKey: "asc" } })) {
    const p = jsonAs<Payload>(h.payload);
    const types = p.findingTypes ?? [];
    const hacts = p.activities ?? [];
    const matches = (!types.length || types.includes(f.type)) && (!hacts.length || !acts.length || hacts.some((a) => acts.includes(a)));
    out.push({ itemType: "hypothesis", itemId: h.id, itemVersion: String(h.version), priority: 5, graphRef: { type: "Hypothesis", id: h.id },
      content: { key: h.itemKey, statement: p.statement, symptoms: p.symptoms, requiredEvidence: p.requiredEvidence, status: "belum terbukti" },
      excludedReason: matches ? undefined : "tidak cocok dengan jenis/aktivitas temuan" });
  }
  if (purpose === "jev_assessment") {
    for (const i of await db().intervention.findMany({ where: { id: { in: await packageRefIds(pkg.id, "intervention") } }, orderBy: { itemKey: "asc" } })) {
      const p = jsonAs<Payload>(i.payload);
      out.push({ itemType: "intervention", itemId: i.id, itemVersion: String(i.version), priority: 5, graphRef: { type: "Intervention", id: i.id }, content: { key: i.itemKey, action: p.action, prerequisites: p.prerequisites, successMetric: p.successMetric } });
    }
    if (pkg.rubricId) {
      const rb = await db().rubric.findUniqueOrThrow({ where: { id: pkg.rubricId } });
      out.push({ itemType: "rubric", itemId: rb.id, itemVersion: String(rb.version), priority: 3, graphRef: { type: "Rubric", id: rb.id }, content: jsonAs<Record<string, unknown>>(rb.payload) });
    }
  }
  return out;
}

type Source = (projectId: string, targetId: string, purpose: string, req: EvidenceBundleRequest) => Promise<Candidate[]>;
const SOURCES: Record<string, Source> = { finding: (p, t, purpose) => findingCandidates(p, t, purpose) };
/** Later features add targets (candidate comparison, assessment) without changing the selection rules. */
export function registerEvidenceSource(targetType: string, source: Source) {
  SOURCES[targetType] = source;
}

const TARGET_NODE: Record<string, string> = { finding: "Finding", candidate_comparison: "Comparison", assessment: "Assessment" };

/** Deterministic for the same target, purpose, budget, graph version and record versions; stored once by hash. */
export async function buildEvidenceBundle(input: unknown): Promise<{ bundleId: string; hash: string; reused: boolean; contextLimited: boolean; contextMaybeStale: boolean }> {
  const req = EvidenceBundleRequest.parse(input);
  try {
    await authorizeUser(req.requestedBy, "project.read", req.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable("requester has no access to the project", "Unauthorized");
    throw err;
  }
  const source = SOURCES[req.targetType];
  if (!source) throw ApplicationFailure.nonRetryable(`no evidence source for ${req.targetType}`, "NotFound");
  const candidates = await source(req.projectId, req.targetId, req.purpose, req);

  // Graph version: projected sequence of input records, so asking twice gives the same bundle.
  const seq = await db().outboxEvent.aggregate({ where: { projectId: req.projectId, projectedAt: { not: null }, aggregateType: { notIn: OUTPUT_AGGREGATES } }, _max: { sequence: true } });
  const graphSequence = Number(seq._max.sequence ?? 0);
  const staleEvents = await staleOutboxEvents(db(), req.projectId, OUTPUT_AGGREGATES);
  let distance = new Map<string, number>();
  let graphMissing = false;
  try {
    const nb = await neighborhood(req.projectId, { type: TARGET_NODE[req.targetType] as never, id: req.targetId }, 3, 400);
    graphMissing = nb.nodes.length === 0;
    // BFS over returned edges gives each node its distance from the target.
    const adj = new Map<string, string[]>();
    for (const e of nb.edges) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
    }
    const startKey = `${TARGET_NODE[req.targetType]}:${req.targetId}`;
    distance = new Map([[startKey, 0]]);
    const queue = [startKey];
    while (queue.length) {
      const k = queue.shift()!;
      for (const n of adj.get(k) ?? []) if (!distance.has(n)) { distance.set(n, distance.get(k)! + 1); queue.push(n); }
    }
  } catch {
    graphMissing = true;
  }
  const dist = (c: Candidate) => (c.graphRef ? distance.get(`${c.graphRef.type}:${c.graphRef.id}`) ?? 9 : 9);
  const ordered = [...candidates].sort((a, b) => a.priority - b.priority || dist(a) - dist(b) || a.itemType.localeCompare(b.itemType) || a.itemId.localeCompare(b.itemId));

  let used = 0, count = 0, limited = false;
  const items: EvidenceItem[] = ordered.map((c, i) => {
    const est = tokens(c.content);
    let reason = c.excludedReason ?? null;
    if (!reason && count >= req.maxItems) reason = "melebihi batas jumlah item";
    if (!reason && used + est > req.maxEstimatedTokens) reason = "melebihi anggaran token";
    if (reason && !c.excludedReason) limited = true;
    if (!reason) { used += est; count++; }
    const d = dist(c);
    return {
      ordinal: i + 1, itemType: c.itemType, itemId: c.itemId, itemVersion: c.itemVersion, priority: c.priority,
      relationPath: d === 9 ? "postgresql" : d === 0 ? "target" : `graph:${d}`,
      included: !reason, exclusionReason: reason, estimatedTokens: est,
      contentRef: !reason ? createHash("sha256").update(stableStringify(c.content)).digest("hex").slice(0, 16) : null,
      content: !reason ? c.content : null,
    };
  });
  const contextMaybeStale = staleEvents > 0 || graphMissing;
  const hash = createHash("sha256").update(stableStringify({
    algorithm: EVIDENCE_ALGORITHM_VERSION, targetType: req.targetType, targetId: req.targetId, purpose: req.purpose, maxItems: req.maxItems,
    maxEstimatedTokens: req.maxEstimatedTokens, graphSequence, focus: req.focusCandidateId ?? null,
    items: items.map((x) => [x.itemType, x.itemId, x.itemVersion, x.included, x.contentRef]),
  })).digest("hex");

  const stored = () => db().evidenceBundle.findUnique({ where: { projectId_hash: { projectId: req.projectId, hash } }, select: { id: true, contextLimited: true, contextMaybeStale: true } });
  const existing = await stored();
  if (existing) return { bundleId: existing.id, hash, reused: true, contextLimited: existing.contextLimited, contextMaybeStale: existing.contextMaybeStale };

  const id = crypto.randomUUID();
  const objectKey = `projects/${req.projectId}/evidence-bundles/${id}.json`;
  const bundle: EvidenceBundle = { id, projectId: req.projectId, targetType: req.targetType, targetId: req.targetId, purpose: req.purpose, graphSequence, hash, contextLimited: limited, contextMaybeStale, algorithmVersion: EVIDENCE_ALGORITHM_VERSION, items };
  await putJson(req.projectId, objectKey, bundle);
  await withTx(async (tx) => {
    // A concurrent build with the same hash may have stored it first; that bundle wins and this one writes nothing.
    const { count } = await tx.evidenceBundle.createMany({
      data: [{
        id, projectId: req.projectId, targetType: req.targetType, targetId: req.targetId, purpose: req.purpose, requestedBy: req.requestedBy, graphSequence: BigInt(graphSequence),
        hash, contextLimited: limited, contextMaybeStale, objectKey, maxItems: req.maxItems, maxEstimatedTokens: req.maxEstimatedTokens,
      }],
      skipDuplicates: true,
    });
    if (!count) return;
    await tx.evidenceBundleItem.createMany({
      data: items.map((x) => ({
        bundleId: id, ordinal: x.ordinal, itemType: x.itemType, itemId: x.itemId, itemVersion: x.itemVersion, relationPath: x.relationPath, priority: x.priority,
        included: x.included, exclusionReason: x.exclusionReason, estimatedTokens: x.estimatedTokens, contentRef: x.contentRef,
      })),
    });
    await audit(tx, { projectId: req.projectId, actorId: req.requestedBy, action: "evidence.bundle.create", objectType: "evidence_bundle", objectId: id, correlationId: req.correlationId, metadata: { purpose: req.purpose, targetType: req.targetType, items: items.filter((x) => x.included).length, contextLimited: limited, contextMaybeStale } });
  });
  const saved = (await stored())!;
  return { bundleId: saved.id, hash, reused: saved.id !== id, contextLimited: limited, contextMaybeStale };
}
