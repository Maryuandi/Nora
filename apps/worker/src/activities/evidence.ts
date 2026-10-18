import { createHash } from "node:crypto";
import { ApplicationFailure } from "@temporalio/activity";
import { authorize, AuthzError } from "@nora/authz";
import { withTx } from "@nora/db";
import { EVIDENCE_ALGORITHM_VERSION, EvidenceBundleRequest, stableStringify, type EvidenceBundle, type EvidenceItem } from "@nora/contracts";
import { neighborhood } from "@nora/graph";
import { putJson } from "@nora/storage";
import { audit, db } from "../db.ts";

type Row = Record<string, any>;
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

const STALE_AFTER_SECONDS = 30;
/** Downstream outputs do not move the graph version; their influence on a bundle shows up in item content hashes. */
const OUTPUT_AGGREGATES = ["evidence_bundles", "assessments", "assessment_corrections", "interpretations", "candidate_comparisons"];
const tokens = (c: unknown) => Math.ceil(JSON.stringify(c).length / 4);
const many = async (sql: string, p: unknown[]): Promise<Row[]> => (await db().query(sql, p)).rows;
const one = async (sql: string, p: unknown[]): Promise<Row | undefined> => (await db().query(sql, p)).rows[0];
/** For rows guaranteed by foreign keys. */
const must = async (sql: string, p: unknown[]): Promise<Row> => (await db().query(sql, p)).rows[0]!;

const UNIT = (k: string) => (/Seconds$/.test(k) ? "seconds" : /(Share|Excess|fitness|Change)$/i.test(k) ? "ratio" : /(Count|Cases|Variants|compliant|nonCompliant|notEvaluable|occurrences|rank)$/i.test(k) ? "count" : "number");

/** Measured finding facts, provenance, context and catalog, in priority order (1 = most important). */
export async function findingCandidates(projectId: string, findingId: string, purpose: string): Promise<Candidate[]> {
  const f = await one("SELECT * FROM findings WHERE id = $1 AND project_id = $2", [findingId, projectId]);
  if (!f) throw ApplicationFailure.nonRetryable("finding not found in project", "NotFound");
  const out: Candidate[] = [];
  const F = { type: "Finding", id: findingId };
  out.push({ itemType: "finding", itemId: findingId, itemVersion: null, priority: 1, graphRef: F, content: { title: f.title, findingType: f.type, summary: f.summary, severityScore: f.severity_score, severityLabel: f.severity_label, population: f.population, thresholds: f.thresholds } });
  for (const [k, v] of Object.entries(f.metrics as Row)) {
    if (v == null) continue;
    out.push({ itemType: "metric_value", itemId: `${findingId}:${k}`, itemVersion: `${f.metric_key}@${f.metric_version}`, priority: 1, graphRef: F, content: { metric: k, value: v, unit: UNIT(k), metricKey: f.metric_key, metricVersion: f.metric_version } });
  }
  const md = await one("SELECT * FROM metric_definitions WHERE key = $1 AND version = $2", [f.metric_key, f.metric_version]);
  if (md) out.push({ itemType: "metric_definition", itemId: `${md.key}:v${md.version}`, itemVersion: String(md.version), priority: 1, graphRef: { type: "MetricDefinition", id: `${md.key}:v${md.version}` }, content: { name: md.name, formula: md.formula, population: md.population, unit: md.unit } });

  const run = await must("SELECT * FROM analysis_runs WHERE id = $1", [f.analysis_run_id]);
  out.push({ itemType: "analysis", itemId: run.id, itemVersion: run.algorithm_version, priority: 2, graphRef: { type: "Analysis", id: run.id }, content: { filter: run.filter_spec, coverage: run.coverage, algorithm: run.algorithm_version } });
  const ds = await must(`SELECT d.*, m.version AS mapping_version, m.config, s.file_name, s.sha256 FROM dataset_versions d JOIN mapping_versions m ON m.id = d.mapping_version_id JOIN source_snapshots s ON s.id = d.snapshot_id WHERE d.id = $1`, [f.dataset_version_id]);
  out.push({ itemType: "dataset_version", itemId: ds.id, itemVersion: String(ds.version), priority: 2, graphRef: { type: "DatasetVersion", id: ds.id }, content: { name: ds.name, contentHash: ds.content_hash, qualityStatus: ds.quality_status, events: ds.event_count, cases: ds.case_count, excludedEvents: ds.excluded_event_count, status: ds.status } });
  out.push({ itemType: "mapping_version", itemId: ds.mapping_version_id, itemVersion: String(ds.mapping_version), priority: 2, graphRef: { type: "MappingVersion", id: ds.mapping_version_id }, content: { labelRules: Object.keys(ds.config.labelMap ?? {}).length, repairRules: ds.config.repairRules ?? [] } });
  out.push({ itemType: "snapshot", itemId: ds.snapshot_id, itemVersion: null, priority: 2, graphRef: { type: "Snapshot", id: ds.snapshot_id }, content: { fileName: ds.file_name, sha256: ds.sha256 } });
  const cap = await one("SELECT capabilities FROM capability_matrix WHERE dataset_version_id = $1", [ds.id]);
  if (cap) out.push({ itemType: "capability_matrix", itemId: ds.id, itemVersion: String(ds.version), priority: 2, graphRef: { type: "DatasetVersion", id: ds.id }, content: cap.capabilities });
  const pkg = await must("SELECT * FROM context_packages WHERE id = $1", [f.context_package_id]);
  out.push({ itemType: "context_package", itemId: pkg.id, itemVersion: String(pkg.version), priority: 2, graphRef: { type: "ContextPackage", id: pkg.id }, content: { name: pkg.name, hash: pkg.hash, conformanceAvailable: pkg.conformance_available } });

  // Context: the rule a finding was evaluated against comes first; document excerpts only, never whole documents.
  for (const r of await many(`SELECT x.*, d.title, d.reference, d.excerpt, d.id AS doc_id FROM context_package_refs p JOIN rules x ON x.id = p.ref_id LEFT JOIN context_documents d ON d.id = x.source_document_id
                               WHERE p.package_id = $1 AND p.ref_type = 'rule' ORDER BY x.item_key`, [pkg.id])) {
    const subject = f.subject.ruleId === r.id;
    out.push({ itemType: "rule", itemId: r.id, itemVersion: String(r.version), priority: subject ? 2 : 4, graphRef: { type: "Rule", id: r.id }, content: { name: r.payload.name, params: r.payload.params, sourceReference: r.source_reference } });
    if (r.doc_id && r.excerpt) out.push({ itemType: "document_excerpt", itemId: r.doc_id, itemVersion: r.version, priority: subject ? 3 : 5, graphRef: { type: "Document", id: r.doc_id }, content: { title: r.title, reference: r.reference, excerpt: String(r.excerpt).slice(0, 1200) } });
  }
  if (f.type === "high_rework" && pkg.rework_definition_id) {
    const rw = await must("SELECT * FROM rework_definitions WHERE id = $1", [pkg.rework_definition_id]);
    out.push({ itemType: "rework_definition", itemId: rw.id, itemVersion: String(rw.version), priority: 2, graphRef: { type: "ReworkDefinition", id: rw.id }, content: rw.payload });
  }
  if (f.type === "bpmn_deviation") {
    const c = await one("SELECT fitness, mismatches, mapping_version FROM conformance_results WHERE run_id = $1", [run.id]);
    if (c) out.push({ itemType: "conformance_summary", itemId: run.id, itemVersion: String(c.mapping_version), priority: 2, graphRef: { type: "Analysis", id: run.id }, content: { fitness: c.fitness, mismatches: (c.mismatches as Row[]).slice(0, 10) } });
  }

  // Supporting cases: pseudonymous case_uid and measured values only (no case ids, resources, or attributes).
  for (const c of await many(`SELECT fc.case_uid, fc.support_metric, fc.support_value, a.duration_s, a.event_count FROM finding_cases fc
                                LEFT JOIN analysis_cases a ON a.run_id = $2 AND a.case_uid = fc.case_uid WHERE fc.finding_id = $1 ORDER BY fc.rank LIMIT 5`, [findingId, run.id])) {
    out.push({ itemType: "case_summary", itemId: c.case_uid, itemVersion: null, priority: 4, graphRef: { type: "CaseRef", id: c.case_uid }, content: { caseRef: c.case_uid, [c.support_metric]: c.support_value, durationSeconds: c.duration_s, events: c.event_count } });
  }

  // Catalog: hypotheses stay labelled unproven; interventions and rubric matter for assessment.
  const acts = [f.subject.from, f.subject.to].filter(Boolean);
  for (const h of await many(`SELECT h.* FROM context_package_refs p JOIN hypotheses h ON h.id = p.ref_id WHERE p.package_id = $1 AND p.ref_type = 'hypothesis' ORDER BY h.item_key`, [pkg.id])) {
    const types: string[] = h.payload.findingTypes ?? [];
    const hacts: string[] = h.payload.activities ?? [];
    const matches = (!types.length || types.includes(f.type)) && (!hacts.length || !acts.length || hacts.some((a) => acts.includes(a)));
    out.push({ itemType: "hypothesis", itemId: h.id, itemVersion: String(h.version), priority: 5, graphRef: { type: "Hypothesis", id: h.id },
      content: { key: h.item_key, statement: h.payload.statement, symptoms: h.payload.symptoms, requiredEvidence: h.payload.requiredEvidence, status: "belum terbukti" },
      excludedReason: matches ? undefined : "tidak cocok dengan jenis/aktivitas temuan" });
  }
  if (purpose === "jev_assessment") {
    for (const i of await many(`SELECT x.* FROM context_package_refs p JOIN interventions x ON x.id = p.ref_id WHERE p.package_id = $1 AND p.ref_type = 'intervention' ORDER BY x.item_key`, [pkg.id])) {
      out.push({ itemType: "intervention", itemId: i.id, itemVersion: String(i.version), priority: 5, graphRef: { type: "Intervention", id: i.id }, content: { key: i.item_key, action: i.payload.action, prerequisites: i.payload.prerequisites, successMetric: i.payload.successMetric } });
    }
    if (pkg.rubric_id) {
      const rb = await must("SELECT * FROM rubrics WHERE id = $1", [pkg.rubric_id]);
      out.push({ itemType: "rubric", itemId: rb.id, itemVersion: String(rb.version), priority: 3, graphRef: { type: "Rubric", id: rb.id }, content: rb.payload });
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
    await authorize(db(), req.requestedBy, "project.read", req.projectId);
  } catch (err) {
    if (err instanceof AuthzError) throw ApplicationFailure.nonRetryable("requester has no access to the project", "Unauthorized");
    throw err;
  }
  const source = SOURCES[req.targetType];
  if (!source) throw ApplicationFailure.nonRetryable(`no evidence source for ${req.targetType}`, "NotFound");
  const candidates = await source(req.projectId, req.targetId, req.purpose, req);

  // Graph version: projected sequence of input records, so asking twice gives the same bundle.
  const g = await one(
    `SELECT coalesce(max(sequence) FILTER (WHERE projected_at IS NOT NULL AND aggregate_type <> ALL($3::text[])), 0) AS seq,
            count(*) FILTER (WHERE projected_at IS NULL AND NOT dead_letter AND aggregate_type <> ALL($3::text[]) AND occurred_at < now() - make_interval(secs => $2)) AS stale
       FROM outbox_events WHERE project_id = $1`, [req.projectId, STALE_AFTER_SECONDS, OUTPUT_AGGREGATES],
  );
  const graphSequence = Number(g!.seq);
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
  const contextMaybeStale = Number(g!.stale) > 0 || graphMissing;
  const hash = createHash("sha256").update(stableStringify({
    algorithm: EVIDENCE_ALGORITHM_VERSION, targetType: req.targetType, targetId: req.targetId, purpose: req.purpose, maxItems: req.maxItems,
    maxEstimatedTokens: req.maxEstimatedTokens, graphSequence, focus: req.focusCandidateId ?? null,
    items: items.map((x) => [x.itemType, x.itemId, x.itemVersion, x.included, x.contentRef]),
  })).digest("hex");

  const existing = await one("SELECT id, context_limited, context_maybe_stale FROM evidence_bundles WHERE project_id = $1 AND hash = $2", [req.projectId, hash]);
  if (existing) return { bundleId: existing.id, hash, reused: true, contextLimited: existing.context_limited, contextMaybeStale: existing.context_maybe_stale };

  const id = crypto.randomUUID();
  const objectKey = `projects/${req.projectId}/evidence-bundles/${id}.json`;
  const bundle: EvidenceBundle = { id, projectId: req.projectId, targetType: req.targetType, targetId: req.targetId, purpose: req.purpose, graphSequence, hash, contextLimited: limited, contextMaybeStale, algorithmVersion: EVIDENCE_ALGORITHM_VERSION, items };
  await putJson(req.projectId, objectKey, bundle);
  await withTx(db(), async (tx) => {
    await tx.query(
      `INSERT INTO evidence_bundles (id, project_id, target_type, target_id, purpose, requested_by, graph_sequence, hash, context_limited, context_maybe_stale, object_key, max_items, max_estimated_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (project_id, hash) DO NOTHING`,
      [id, req.projectId, req.targetType, req.targetId, req.purpose, req.requestedBy, graphSequence, hash, limited, contextMaybeStale, objectKey, req.maxItems, req.maxEstimatedTokens],
    );
    for (const x of items) {
      await tx.query(
        `INSERT INTO evidence_bundle_items (bundle_id, ordinal, item_type, item_id, item_version, relation_path, priority, included, exclusion_reason, estimated_tokens, content_ref)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 WHERE EXISTS (SELECT 1 FROM evidence_bundles WHERE id = $1)`,
        [id, x.ordinal, x.itemType, x.itemId, x.itemVersion, x.relationPath, x.priority, x.included, x.exclusionReason, x.estimatedTokens, x.contentRef],
      );
    }
    await audit(tx, { projectId: req.projectId, actorId: req.requestedBy, action: "evidence.bundle.create", objectType: "evidence_bundle", objectId: id, correlationId: req.correlationId, metadata: { purpose: req.purpose, targetType: req.targetType, items: items.filter((x) => x.included).length, contextLimited: limited, contextMaybeStale } });
  });
  const saved = await one("SELECT id FROM evidence_bundles WHERE project_id = $1 AND hash = $2", [req.projectId, hash]);
  return { bundleId: saved!.id, hash, reused: saved!.id !== id, contextLimited: limited, contextMaybeStale };
}
