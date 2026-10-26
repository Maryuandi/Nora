import { jsonAs, type Prisma } from "@nora/db";
import { deleteProjectGraph, ensureSchema, writeProjection, type NodeRef, type Writer } from "@nora/graph";
import type { MappingConfig } from "@nora/contracts";
import { db } from "../db.ts";

type Handler = (w: Writer, id: string, projectId: string) => Promise<void>;
type Props = Record<string, unknown>;
type Stamped = { id: string; createdAt: Date };

const ref = (type: NodeRef["type"], id: string): NodeRef => ({ type, id });
const human = (r: Stamped, extra: Props = {}) => ({ creatorType: "human", recordId: r.id, at: r.createdAt, ...extra });
const code = (r: Stamped, extra: Props = {}) => ({ creatorType: "code", recordId: r.id, at: r.createdAt, ...extra });

/** Finding subject, as the monitoring stage writes it. */
interface Subject { from?: string; to?: string; ruleId?: string; ruleVersion?: number; modelId?: string; rules?: { activity?: string }[] }
/** The catalog fields the projection reads from context payloads. */
interface Payload { name?: string; statement?: string; action?: string; addressedHypotheses?: string[]; findingTypes?: string[]; activities?: string[] }

const CONTEXT_SELECT = { id: true, createdAt: true, status: true, itemKey: true, version: true, payload: true, sourceDocumentId: true } as const;
type ContextRecord = { id: string; createdAt: Date; status: string; itemKey: string; version: number; payload: Prisma.JsonValue; sourceDocumentId: string | null };

/** Context items share a shape; only approved (or since-retired) versions become nodes. */
const contextItem = (type: NodeRef["type"], load: (id: string) => Promise<ContextRecord | null>, labelOf: (p: Payload) => string): Handler => async (w, id) => {
  const r = await load(id);
  if (!r || (r.status !== "approved" && r.status !== "obsolete")) return;
  await w.node(ref(type, id), labelOf(jsonAs<Payload>(r.payload)), { itemKey: r.itemKey, version: r.version, status: r.status, superseded: r.status === "obsolete" });
  if (r.sourceDocumentId) await w.rel("CITES", ref(type, id), ref("Document", r.sourceDocumentId), human(r));
};

/** Hypotheses of a package that may explain a finding of this type and subject. */
async function matchingHypotheses(packageId: string, findingType: string, subject: Subject) {
  const refs = await db().contextPackageRef.findMany({ where: { packageId, refType: "hypothesis" }, select: { refId: true } });
  const rows = await db().hypothesis.findMany({ where: { id: { in: refs.map((r) => r.refId) } }, select: { id: true, payload: true } });
  const acts = [subject.from, subject.to].filter((a): a is string => !!a);
  return rows.filter((h) => {
    const p = jsonAs<Payload>(h.payload);
    const types = p.findingTypes ?? [];
    const hacts = p.activities ?? [];
    return !((types.length && !types.includes(findingType)) || (hacts.length && acts.length && !hacts.some((a) => acts.includes(a))));
  });
}

const HANDLERS: Record<string, Handler> = {
  async sources(w, id) {
    const r = await db().source.findUnique({ where: { id } });
    if (r) await w.node(ref("Source", id), r.name, { createdAt: r.createdAt });
  },
  async source_snapshots(w, id) {
    const r = await db().sourceSnapshot.findUnique({ where: { id } });
    if (!r || !["ready_for_mapping", "needs_review"].includes(r.status)) return;
    await w.node(ref("Snapshot", id), r.fileName, { sha256: r.sha256, status: r.status, rows: r.rowCount });
    await w.rel("DERIVED_FROM", ref("Snapshot", id), ref("Source", r.sourceId), human(r));
  },
  async mapping_versions(w, id) {
    const r = await db().mappingVersion.findUnique({ where: { id } });
    if (!r) return;
    const config = jsonAs<MappingConfig>(r.config);
    await w.node(ref("MappingVersion", id), `Mapping v${r.version}`, { version: r.version, labelRules: Object.keys(config.labelMap ?? {}).length });
    await w.rel("DERIVED_FROM", ref("MappingVersion", id), ref("Source", r.sourceId), human(r, { version: r.version }));
    for (const [i, rule] of (config.repairRules ?? []).entries()) {
      await w.node(ref("RepairRule", `${id}:${i}`), `Aturan perbaikan: ${(rule.checks ?? []).join(", ")}`, { version: r.version });
      await w.rel("CITES", ref("MappingVersion", id), ref("RepairRule", `${id}:${i}`), human(r));
    }
  },
  async dataset_versions(w, id) {
    const r = await db().datasetVersion.findUnique({ where: { id } });
    if (!r || !["published", "superseded"].includes(r.status)) return;
    await w.node(ref("DatasetVersion", id), r.name, { version: r.version, status: r.status, contentHash: r.contentHash, superseded: r.status === "superseded", quality: r.qualityStatus });
    await w.rel("USES_MAPPING", ref("DatasetVersion", id), ref("MappingVersion", r.mappingVersionId), code(r, { version: r.version }));
    await w.rel("DERIVED_FROM", ref("DatasetVersion", id), ref("Snapshot", r.snapshotId), code(r));
    if (r.status === "superseded" && r.publishedAt) {
      const newer = await db().datasetVersion.findFirst({
        where: { projectId: r.projectId, publishedAt: { gt: r.publishedAt }, status: { in: ["published", "superseded"] } }, orderBy: { publishedAt: "asc" }, select: { id: true },
      });
      if (newer) await w.rel("SUPERSEDES", ref("DatasetVersion", newer.id), ref("DatasetVersion", id), code(r));
    }
  },
  async context_documents(w, id) {
    const r = await db().contextDocument.findUnique({ where: { id } });
    if (r) await w.node(ref("Document", id), r.title, { reference: r.reference, version: r.version });
  },
  process_boundaries: contextItem("ProcessDefinition", (id) => db().processBoundary.findUnique({ where: { id }, select: CONTEXT_SELECT }), () => "Batas proses"),
  rework_definitions: contextItem("ReworkDefinition", (id) => db().reworkDefinition.findUnique({ where: { id }, select: CONTEXT_SELECT }), () => "Definisi rework"),
  rules: contextItem("Rule", (id) => db().rule.findUnique({ where: { id }, select: CONTEXT_SELECT }), (p) => p.name ?? ""),
  calendars: contextItem("Calendar", (id) => db().calendar.findUnique({ where: { id }, select: CONTEXT_SELECT }), () => "Kalender kerja"),
  hypotheses: contextItem("Hypothesis", (id) => db().hypothesis.findUnique({ where: { id }, select: CONTEXT_SELECT }), (p) => p.statement ?? ""),
  rubrics: contextItem("Rubric", (id) => db().rubric.findUnique({ where: { id }, select: CONTEXT_SELECT }), (p) => p.name ?? ""),
  async interventions(w, id, projectId) {
    await contextItem("Intervention", (x) => db().intervention.findUnique({ where: { id: x }, select: CONTEXT_SELECT }), (p) => p.action ?? "")(w, id, projectId);
    const r = await db().intervention.findFirst({ where: { id, status: "approved" } });
    for (const key of r ? jsonAs<Payload>(r.payload).addressedHypotheses ?? [] : []) {
      const h = await db().hypothesis.findFirst({ where: { projectId, itemKey: key, status: "approved" }, select: { id: true } });
      if (h) await w.rel("CITES", ref("Intervention", id), ref("Hypothesis", h.id), human(r!));
    }
  },
  async bpmn_models(w, id) {
    const r = await db().bpmnModel.findUnique({ where: { id } });
    if (!r || (r.status !== "approved" && r.status !== "obsolete")) return;
    await w.node(ref("BpmnModel", id), r.name, { version: r.version, validation: r.validationStatus, superseded: r.status === "obsolete" });
    if (r.sourceDocumentId) await w.rel("CITES", ref("BpmnModel", id), ref("Document", r.sourceDocumentId), human(r));
    for (const t of jsonAs<{ id: string; name: string }[]>(r.tasks)) {
      await w.node(ref("BpmnTask", `${id}:${t.id}`), t.name, { taskId: t.id });
      await w.rel("DERIVED_FROM", ref("BpmnTask", `${id}:${t.id}`), ref("BpmnModel", id), human(r));
    }
  },
  async bpmn_mappings() { /* attached through the context package */ },
  async context_packages(w, id) {
    const r = await db().contextPackage.findUnique({ where: { id } });
    if (!r || !["active", "superseded"].includes(r.status)) return;
    await w.node(ref("ContextPackage", id), r.name, { version: r.version, hash: r.hash, status: r.status, superseded: r.status === "superseded" });
    const TYPE: Record<string, NodeRef["type"]> = { process_boundary: "ProcessDefinition", rework_definition: "ReworkDefinition", rule: "Rule", calendar: "Calendar", hypothesis: "Hypothesis", intervention: "Intervention", rubric: "Rubric", bpmn_model: "BpmnModel" };
    for (const x of await db().contextPackageRef.findMany({ where: { packageId: id }, select: { refType: true, refId: true, refVersion: true } })) {
      const type = TYPE[x.refType];
      if (type) await w.rel("CITES", ref("ContextPackage", id), ref(type, x.refId), human(r, { version: x.refVersion }));
    }
    if (r.status === "superseded") {
      const newer = await db().contextPackage.findFirst({
        where: { projectId: r.projectId, version: { gt: r.version }, status: { in: ["active", "superseded"] } }, orderBy: { version: "asc" }, select: { id: true },
      });
      if (newer) await w.rel("SUPERSEDES", ref("ContextPackage", newer.id), ref("ContextPackage", id), human(r));
    }
  },
  async analysis_runs(w, id) {
    const r = await db().analysisRun.findUnique({ where: { id } });
    if (!r || r.status !== "completed") return;
    await w.node(ref("Analysis", id), "Analysis run", { algorithm: r.algorithmVersion, filter: r.filterSpec, completedAt: r.completedAt });
    await w.rel("DERIVED_FROM", ref("Analysis", id), ref("DatasetVersion", r.datasetVersionId), code(r));
    await w.rel("EVALUATED_AGAINST", ref("Analysis", id), ref("ContextPackage", r.contextPackageId), code(r));
    // Only aggregates: activities, the heaviest transitions and the top variants; never every event or case.
    for (const n of await db().processNode.findMany({ where: { runId: id }, select: { activity: true, caseCount: true } })) {
      await w.node(ref("Activity", n.activity), n.activity);
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Activity", n.activity), code(r, { caseCount: n.caseCount }));
    }
    const edges = await db().processEdge.findMany({
      where: { runId: id, fromActivity: { not: "__start" }, toActivity: { not: "__end" } }, orderBy: { totalWaitS: "desc" }, take: 30,
      select: { fromActivity: true, toActivity: true, caseCount: true, totalWaitS: true },
    });
    for (const e of edges) {
      const tid = `${e.fromActivity}→${e.toActivity}`;
      await w.node(ref("Transition", tid), tid, { from: e.fromActivity, to: e.toActivity });
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Transition", tid), code(r, { caseCount: e.caseCount, totalWaitSeconds: e.totalWaitS }));
      await w.rel("CO_OCCURS_WITH", ref("Activity", e.fromActivity), ref("Activity", e.toActivity), code(r));
    }
    for (const v of await db().variant.findMany({ where: { runId: id }, orderBy: { rank: "asc" }, take: 10, select: { sequenceHash: true, sequence: true, caseCount: true } })) {
      await w.node(ref("Variant", v.sequenceHash), jsonAs<string[]>(v.sequence).join(" → "));
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Variant", v.sequenceHash), code(r, { caseCount: v.caseCount }));
    }
    // Findings are written before the run is marked completed; project them again now that their run node exists.
    for (const f of await db().finding.findMany({ where: { analysisRunId: id }, select: { id: true } })) await HANDLERS.findings!(w, f.id, r.projectId);
  },
  async findings(w, id) {
    const f = await db().finding.findUnique({ where: { id } });
    if (!f) return;
    const subject = jsonAs<Subject>(f.subject);
    await w.node(ref("Finding", id), f.title, { findingType: f.type, severity: f.severityScore });
    await w.rel("DERIVED_FROM", ref("Finding", id), ref("Analysis", f.analysisRunId), code(f));
    const metricId = `${f.metricKey}:v${f.metricVersion}`;
    await w.node(ref("MetricDefinition", metricId), f.metricKey, { version: f.metricVersion });
    await w.rel("COMPUTED_WITH", ref("Finding", id), ref("MetricDefinition", metricId), code(f, { version: f.metricVersion }));
    if (subject.from && subject.to) await w.rel("OBSERVED_AT", ref("Finding", id), ref("Transition", `${subject.from}→${subject.to}`), code(f));
    if (subject.ruleId) await w.rel("EVALUATED_AGAINST", ref("Finding", id), ref("Rule", subject.ruleId), code(f, { version: subject.ruleVersion }));
    if (subject.modelId) await w.rel("EVALUATED_AGAINST", ref("Finding", id), ref("BpmnModel", subject.modelId), code(f));
    for (const rw of subject.rules ?? []) if (rw.activity) await w.rel("OBSERVED_AT", ref("Finding", id), ref("Activity", rw.activity), code(f));
    // Selected case references only (pseudonymous case_uid), the ones a reader opens first.
    for (const c of await db().findingCase.findMany({ where: { findingId: id }, orderBy: { rank: "asc" }, take: 5, select: { caseUid: true, supportValue: true } })) {
      await w.node(ref("CaseRef", c.caseUid), c.caseUid);
      await w.rel("SUPPORTED_BY_CASE", ref("Finding", id), ref("CaseRef", c.caseUid), code(f, { supportValue: c.supportValue }));
    }
    for (const h of await matchingHypotheses(f.contextPackageId, f.type, subject)) {
      await w.rel("MAY_EXPLAIN", ref("Hypothesis", h.id), ref("Finding", id), { creatorType: "human", recordId: h.id, status: "unproven", at: f.createdAt });
    }
  },
  async assessments(w, id) {
    const a = await db().assessment.findUnique({ where: { id }, include: { candidateLink: { select: { candidateId: true } } } });
    if (!a || !["automatic", "needs_review", "insufficient_information"].includes(a.status)) return;
    await w.node(ref("Assessment", id), `Penilaian Jev: ${a.conclusion ?? a.status}`, { status: a.status, conclusion: a.conclusion, totalScore: a.totalScore, modelVersion: a.modelVersion });
    const m = { creatorType: "model", recordId: id, at: a.completedAt, version: a.modelVersion };
    await w.rel("DERIVED_FROM", ref("Assessment", id), ref("Finding", a.findingId), m);
    if (a.evidenceBundleId) await w.rel("CITES", ref("Assessment", id), ref("EvidenceBundle", a.evidenceBundleId), m);
    // A model judgement is a hypothesis-level relation, never an observation.
    const candidate = a.candidateLink.candidateId;
    if (a.conclusion === "relevant" || a.conclusion === "partly_relevant") await w.rel("SUPPORTS", ref("Intervention", candidate), ref("Finding", a.findingId), { ...m, status: "unproven", assessmentId: id });
    if (a.conclusion === "not_relevant") await w.rel("CONTRADICTS", ref("Intervention", candidate), ref("Finding", a.findingId), { ...m, status: "unproven", assessmentId: id });
  },
  async assessment_corrections(w, id) {
    const c = await db().assessmentCorrection.findUnique({ where: { id }, include: { assessment: { select: { findingId: true } } } });
    if (!c) return;
    await w.rel("REVIEWED", ref("Assessment", c.assessmentId), ref("Finding", c.assessment.findingId),
      { creatorType: "human", recordId: id, at: c.createdAt, kind: c.kind, conclusion: c.conclusion, status: c.kind === "confirm" ? "confirmed" : "corrected" });
  },
  async evidence_bundles(w, id) {
    const b = await db().evidenceBundle.findUnique({ where: { id } });
    if (!b) return;
    await w.node(ref("EvidenceBundle", id), `Paket bukti ${b.purpose}`, { purpose: b.purpose, hash: b.hash, contextLimited: b.contextLimited });
    const target = ({ finding: "Finding", assessment: "Assessment", candidate_comparison: "Comparison" } as const)[b.targetType];
    if (target) await w.rel("CITES", ref("EvidenceBundle", id), ref(target, b.targetId), code(b));
  },
};

export function registerGraphHandler(table: string, handler: Handler) {
  HANDLERS[table] = handler;
}

export async function pendingGraphProjects(): Promise<string[]> {
  await ensureSchema();
  const [pending, rebuild] = await Promise.all([
    db().outboxEvent.groupBy({ by: ["projectId"], where: { projectedAt: null, deadLetter: false } }),
    db().graphProjectionState.findMany({ where: { rebuildRequestedAt: { not: null } }, select: { projectId: true } }),
  ]);
  return [...new Set([...pending, ...rebuild].map((r) => r.projectId))];
}

const MAX_ATTEMPTS = 3;

/** Applies pending events in sequence order; a failing event is retried, then dead-lettered without blocking the rest. */
export async function projectGraph(projectId: string): Promise<{ projected: number; failed: number }> {
  const state = await db().graphProjectionState.upsert({ where: { projectId }, create: { projectId }, update: {}, select: { rebuildRequestedAt: true } });
  if (state.rebuildRequestedAt) {
    await deleteProjectGraph(projectId);
    await db().outboxEvent.updateMany({ where: { projectId }, data: { projectedAt: null, attempts: 0, lastError: null, deadLetter: false } });
    await db().graphProjectionState.update({ where: { projectId }, data: { lastSequence: 0, rebuildRequestedAt: null, rebuiltAt: new Date() } });
  }
  let projected = 0, failed = 0;
  const failedNow: bigint[] = []; // retried on the next sweep, not in a tight loop
  for (;;) {
    const rows = await db().outboxEvent.findMany({
      where: { projectId, projectedAt: null, deadLetter: false, sequence: { notIn: failedNow } }, orderBy: { sequence: "asc" }, take: 200,
      select: { sequence: true, aggregateType: true, aggregateId: true },
    });
    if (!rows.length) break;
    for (const e of rows) {
      try {
        const h = HANDLERS[e.aggregateType];
        if (h) await writeProjection(projectId, (w) => h(w, e.aggregateId, projectId));
        const now = new Date();
        await db().outboxEvent.update({ where: { sequence: e.sequence }, data: { projectedAt: now } });
        // GREATEST: sweeps may overlap after a restart; the projected sequence never moves back.
        await db().$executeRaw`UPDATE graph_projection_state SET last_sequence = GREATEST(last_sequence, ${e.sequence}), last_projected_at = now() WHERE project_id = ${projectId}::uuid`;
        projected++;
      } catch (err) {
        failed++;
        failedNow.push(e.sequence);
        const attempts = (await db().outboxEvent.update({
          where: { sequence: e.sequence }, data: { attempts: { increment: 1 }, lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500) }, select: { attempts: true },
        })).attempts;
        if (attempts >= MAX_ATTEMPTS) await db().outboxEvent.update({ where: { sequence: e.sequence }, data: { deadLetter: true } });
      }
    }
    if (projected + failed > 5000) break; // the next sweep continues
  }
  return { projected, failed };
}
