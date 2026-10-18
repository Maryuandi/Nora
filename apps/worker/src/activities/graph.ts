import { deleteProjectGraph, ensureSchema, writeProjection, type NodeRef, type Writer } from "@nora/graph";
import { db } from "../db.ts";

type Row = Record<string, any>;
type Handler = (w: Writer, id: string, projectId: string) => Promise<void>;

const one = async (sql: string, params: unknown[]): Promise<Row | undefined> => (await db().query(sql, params)).rows[0];
const many = async (sql: string, params: unknown[]): Promise<Row[]> => (await db().query(sql, params)).rows;
const ref = (type: NodeRef["type"], id: string): NodeRef => ({ type, id });
const human = (r: Row, extra: Row = {}) => ({ creatorType: "human", recordId: r.id, at: r.created_at, ...extra });
const code = (r: Row, extra: Row = {}) => ({ creatorType: "code", recordId: r.id, at: r.created_at, ...extra });

async function cites(w: Writer, from: NodeRef, r: Row) {
  if (r.source_document_id) await w.rel("CITES", from, ref("Document", r.source_document_id), human(r));
}

/** Context items share a shape; only approved (or since-retired) versions become nodes. */
const contextItem = (table: string, type: NodeRef["type"], labelOf: (r: Row) => string): Handler => async (w, id) => {
  const r = await one(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!r || (r.status !== "approved" && r.status !== "obsolete")) return;
  await w.node(ref(type, id), labelOf(r), { itemKey: r.item_key, version: r.version, status: r.status, superseded: r.status === "obsolete" });
  await cites(w, ref(type, id), r);
};

const HANDLERS: Record<string, Handler> = {
  async sources(w, id) {
    const r = await one("SELECT * FROM sources WHERE id = $1", [id]);
    if (r) await w.node(ref("Source", id), r.name, { createdAt: r.created_at });
  },
  async source_snapshots(w, id) {
    const r = await one("SELECT * FROM source_snapshots WHERE id = $1", [id]);
    if (!r || !["ready_for_mapping", "needs_review"].includes(r.status)) return;
    await w.node(ref("Snapshot", id), r.file_name, { sha256: r.sha256, status: r.status, rows: r.row_count });
    await w.rel("DERIVED_FROM", ref("Snapshot", id), ref("Source", r.source_id), human(r));
  },
  async mapping_versions(w, id) {
    const r = await one("SELECT * FROM mapping_versions WHERE id = $1", [id]);
    if (!r) return;
    await w.node(ref("MappingVersion", id), `Mapping v${r.version}`, { version: r.version, labelRules: Object.keys(r.config.labelMap ?? {}).length });
    await w.rel("DERIVED_FROM", ref("MappingVersion", id), ref("Source", r.source_id), human(r, { version: r.version }));
    for (const [i, rule] of (r.config.repairRules ?? []).entries()) {
      await w.node(ref("RepairRule", `${id}:${i}`), `Aturan perbaikan: ${(rule.checks ?? []).join(", ")}`, { version: r.version });
      await w.rel("CITES", ref("MappingVersion", id), ref("RepairRule", `${id}:${i}`), human(r));
    }
  },
  async dataset_versions(w, id) {
    const r = await one("SELECT * FROM dataset_versions WHERE id = $1", [id]);
    if (!r || !["published", "superseded"].includes(r.status)) return;
    await w.node(ref("DatasetVersion", id), r.name, { version: r.version, status: r.status, contentHash: r.content_hash, superseded: r.status === "superseded", quality: r.quality_status });
    await w.rel("USES_MAPPING", ref("DatasetVersion", id), ref("MappingVersion", r.mapping_version_id), code(r, { version: r.version }));
    await w.rel("DERIVED_FROM", ref("DatasetVersion", id), ref("Snapshot", r.snapshot_id), code(r));
    if (r.status === "superseded") {
      const newer = await one("SELECT id FROM dataset_versions WHERE project_id = $1 AND published_at > $2 AND status IN ('published', 'superseded') ORDER BY published_at LIMIT 1", [r.project_id, r.published_at]);
      if (newer) await w.rel("SUPERSEDES", ref("DatasetVersion", newer.id), ref("DatasetVersion", id), code(r));
    }
  },
  async context_documents(w, id) {
    const r = await one("SELECT * FROM context_documents WHERE id = $1", [id]);
    if (r) await w.node(ref("Document", id), r.title, { reference: r.reference, version: r.version });
  },
  process_boundaries: contextItem("process_boundaries", "ProcessDefinition", () => "Batas proses"),
  rework_definitions: contextItem("rework_definitions", "ReworkDefinition", () => "Definisi rework"),
  rules: contextItem("rules", "Rule", (r) => r.payload.name),
  calendars: contextItem("calendars", "Calendar", () => "Kalender kerja"),
  hypotheses: contextItem("hypotheses", "Hypothesis", (r) => r.payload.statement),
  rubrics: contextItem("rubrics", "Rubric", (r) => r.payload.name),
  async interventions(w, id, projectId) {
    await contextItem("interventions", "Intervention", (r) => r.payload.action)(w, id, projectId);
    const r = await one("SELECT * FROM interventions WHERE id = $1 AND status = 'approved'", [id]);
    for (const key of r?.payload.addressedHypotheses ?? []) {
      const h = await one("SELECT id FROM hypotheses WHERE project_id = $1 AND item_key = $2 AND status = 'approved'", [projectId, key]);
      if (h) await w.rel("CITES", ref("Intervention", id), ref("Hypothesis", h.id), human(r!));
    }
  },
  async bpmn_models(w, id) {
    const r = await one("SELECT * FROM bpmn_models WHERE id = $1", [id]);
    if (!r || (r.status !== "approved" && r.status !== "obsolete")) return;
    await w.node(ref("BpmnModel", id), r.name, { version: r.version, validation: r.validation_status, superseded: r.status === "obsolete" });
    await cites(w, ref("BpmnModel", id), r);
    for (const t of r.tasks) {
      await w.node(ref("BpmnTask", `${id}:${t.id}`), t.name, { taskId: t.id });
      await w.rel("DERIVED_FROM", ref("BpmnTask", `${id}:${t.id}`), ref("BpmnModel", id), human(r));
    }
  },
  async bpmn_mappings() { /* attached through the context package */ },
  async context_packages(w, id) {
    const r = await one("SELECT * FROM context_packages WHERE id = $1", [id]);
    if (!r || !["active", "superseded"].includes(r.status)) return;
    await w.node(ref("ContextPackage", id), r.name, { version: r.version, hash: r.hash, status: r.status, superseded: r.status === "superseded" });
    const TYPE: Record<string, NodeRef["type"]> = { process_boundary: "ProcessDefinition", rework_definition: "ReworkDefinition", rule: "Rule", calendar: "Calendar", hypothesis: "Hypothesis", intervention: "Intervention", rubric: "Rubric", bpmn_model: "BpmnModel" };
    for (const x of await many("SELECT ref_type, ref_id, ref_version FROM context_package_refs WHERE package_id = $1", [id])) {
      if (TYPE[x.ref_type]) await w.rel("CITES", ref("ContextPackage", id), ref(TYPE[x.ref_type]!, x.ref_id), human(r, { version: x.ref_version }));
    }
    if (r.status === "superseded") {
      const newer = await one("SELECT id FROM context_packages WHERE project_id = $1 AND version > $2 AND status IN ('active', 'superseded') ORDER BY version LIMIT 1", [r.project_id, r.version]);
      if (newer) await w.rel("SUPERSEDES", ref("ContextPackage", newer.id), ref("ContextPackage", id), human(r));
    }
  },
  async analysis_runs(w, id) {
    const r = await one("SELECT * FROM analysis_runs WHERE id = $1", [id]);
    if (!r || r.status !== "completed") return;
    await w.node(ref("Analysis", id), "Analysis run", { algorithm: r.algorithm_version, filter: r.filter_spec, completedAt: r.completed_at });
    await w.rel("DERIVED_FROM", ref("Analysis", id), ref("DatasetVersion", r.dataset_version_id), code(r));
    await w.rel("EVALUATED_AGAINST", ref("Analysis", id), ref("ContextPackage", r.context_package_id), code(r));
    // Only aggregates: activities, the heaviest transitions and the top variants; never every event or case.
    for (const n of await many("SELECT activity, case_count FROM process_nodes WHERE run_id = $1", [id])) {
      await w.node(ref("Activity", n.activity), n.activity);
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Activity", n.activity), code(r, { caseCount: n.case_count }));
    }
    for (const e of await many("SELECT from_activity, to_activity, case_count, total_wait_s FROM process_edges WHERE run_id = $1 AND from_activity <> '__start' AND to_activity <> '__end' ORDER BY total_wait_s DESC LIMIT 30", [id])) {
      const tid = `${e.from_activity}→${e.to_activity}`;
      await w.node(ref("Transition", tid), tid, { from: e.from_activity, to: e.to_activity });
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Transition", tid), code(r, { caseCount: e.case_count, totalWaitSeconds: e.total_wait_s }));
      await w.rel("CO_OCCURS_WITH", ref("Activity", e.from_activity), ref("Activity", e.to_activity), code(r));
    }
    for (const v of await many("SELECT sequence_hash, sequence, case_count FROM variants WHERE run_id = $1 ORDER BY rank LIMIT 10", [id])) {
      await w.node(ref("Variant", v.sequence_hash), (v.sequence as string[]).join(" → "));
      await w.rel("OBSERVED_AT", ref("Analysis", id), ref("Variant", v.sequence_hash), code(r, { caseCount: v.case_count }));
    }
    // Findings are written before the run is marked completed; project them again now that their run node exists.
    for (const f of await many("SELECT id FROM findings WHERE analysis_run_id = $1", [id])) await HANDLERS.findings!(w, f.id, r.project_id);
  },
  async findings(w, id) {
    const f = await one("SELECT * FROM findings WHERE id = $1", [id]);
    if (!f) return;
    await w.node(ref("Finding", id), f.title, { findingType: f.type, severity: f.severity_score });
    await w.rel("DERIVED_FROM", ref("Finding", id), ref("Analysis", f.analysis_run_id), code(f));
    const metricId = `${f.metric_key}:v${f.metric_version}`;
    await w.node(ref("MetricDefinition", metricId), f.metric_key, { version: f.metric_version });
    await w.rel("COMPUTED_WITH", ref("Finding", id), ref("MetricDefinition", metricId), code(f, { version: f.metric_version }));
    if (f.subject.from && f.subject.to) await w.rel("OBSERVED_AT", ref("Finding", id), ref("Transition", `${f.subject.from}→${f.subject.to}`), code(f));
    if (f.subject.ruleId) await w.rel("EVALUATED_AGAINST", ref("Finding", id), ref("Rule", f.subject.ruleId), code(f, { version: f.subject.ruleVersion }));
    if (f.subject.modelId) await w.rel("EVALUATED_AGAINST", ref("Finding", id), ref("BpmnModel", f.subject.modelId), code(f));
    for (const rw of f.subject.rules ?? []) if (rw.activity) await w.rel("OBSERVED_AT", ref("Finding", id), ref("Activity", rw.activity), code(f));
    // Selected case references only (pseudonymous case_uid), the ones a reader opens first.
    for (const c of await many("SELECT case_uid, support_value FROM finding_cases WHERE finding_id = $1 ORDER BY rank LIMIT 5", [id])) {
      await w.node(ref("CaseRef", c.case_uid), c.case_uid);
      await w.rel("SUPPORTED_BY_CASE", ref("Finding", id), ref("CaseRef", c.case_uid), code(f, { supportValue: c.support_value }));
    }
    const acts = [f.subject.from, f.subject.to].filter(Boolean);
    for (const h of await many(
      `SELECT h.id, h.payload FROM context_package_refs p JOIN hypotheses h ON h.id = p.ref_id WHERE p.package_id = $1 AND p.ref_type = 'hypothesis'`, [f.context_package_id],
    )) {
      const types: string[] = h.payload.findingTypes ?? [];
      const hacts: string[] = h.payload.activities ?? [];
      if ((types.length && !types.includes(f.type)) || (hacts.length && acts.length && !hacts.some((a) => acts.includes(a)))) continue;
      await w.rel("MAY_EXPLAIN", ref("Hypothesis", h.id), ref("Finding", id), { creatorType: "human", recordId: h.id, status: "unproven", at: f.created_at });
    }
  },
  async evidence_bundles(w, id) {
    const b = await one("SELECT * FROM evidence_bundles WHERE id = $1", [id]);
    if (!b) return;
    await w.node(ref("EvidenceBundle", id), `Paket bukti ${b.purpose}`, { purpose: b.purpose, hash: b.hash, contextLimited: b.context_limited });
    if (b.target_type === "finding") await w.rel("CITES", ref("EvidenceBundle", id), ref("Finding", b.target_id), code(b));
  },
};

export function registerGraphHandler(table: string, handler: Handler) {
  HANDLERS[table] = handler;
}

export async function pendingGraphProjects(): Promise<string[]> {
  await ensureSchema();
  const { rows } = await db().query<{ project_id: string }>(
    `SELECT DISTINCT project_id FROM outbox_events WHERE projected_at IS NULL AND NOT dead_letter
     UNION SELECT project_id FROM graph_projection_state WHERE rebuild_requested_at IS NOT NULL`,
  );
  return rows.map((r) => r.project_id);
}

const MAX_ATTEMPTS = 3;

/** Applies pending events in sequence order; a failing event is retried, then dead-lettered without blocking the rest. */
export async function projectGraph(projectId: string): Promise<{ projected: number; failed: number }> {
  const state = (await db().query<{ rebuild_requested_at: string | null }>(
    "INSERT INTO graph_projection_state (project_id) VALUES ($1) ON CONFLICT (project_id) DO UPDATE SET project_id = EXCLUDED.project_id RETURNING rebuild_requested_at", [projectId],
  )).rows[0]!;
  if (state.rebuild_requested_at) {
    await deleteProjectGraph(projectId);
    await db().query("UPDATE outbox_events SET projected_at = NULL, attempts = 0, last_error = NULL, dead_letter = false WHERE project_id = $1", [projectId]);
    await db().query("UPDATE graph_projection_state SET last_sequence = 0, rebuild_requested_at = NULL, rebuilt_at = now() WHERE project_id = $1", [projectId]);
  }
  let projected = 0, failed = 0;
  const failedNow: number[] = []; // retried on the next sweep, not in a tight loop
  for (;;) {
    const { rows } = await db().query<{ sequence: number; aggregate_type: string; aggregate_id: string }>(
      "SELECT sequence, aggregate_type, aggregate_id FROM outbox_events WHERE project_id = $1 AND projected_at IS NULL AND NOT dead_letter AND sequence <> ALL($2::bigint[]) ORDER BY sequence LIMIT 200",
      [projectId, failedNow],
    );
    if (!rows.length) break;
    for (const e of rows) {
      try {
        const h = HANDLERS[e.aggregate_type];
        if (h) await writeProjection(projectId, (w) => h(w, e.aggregate_id, projectId));
        await db().query("UPDATE outbox_events SET projected_at = now() WHERE sequence = $1", [e.sequence]);
        await db().query("UPDATE graph_projection_state SET last_sequence = GREATEST(last_sequence, $2), last_projected_at = now() WHERE project_id = $1", [projectId, e.sequence]);
        projected++;
      } catch (err) {
        failed++;
        failedNow.push(e.sequence);
        await db().query(
          "UPDATE outbox_events SET attempts = attempts + 1, last_error = $2, dead_letter = attempts + 1 >= $3 WHERE sequence = $1",
          [e.sequence, (err instanceof Error ? err.message : String(err)).slice(0, 500), MAX_ATTEMPTS],
        );
      }
    }
    if (projected + failed > 5000) break; // the next sweep continues
  }
  return { projected, failed };
}
