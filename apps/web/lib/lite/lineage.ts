import "server-only";
import type { Viewer } from "./auth";
import { db } from "./db";
import { getFinding } from "./findings";

export type RelationCategory = "lineage" | "observation" | "hypothesis" | "review";

export interface LineageNode {
  id: string;
  type: string;
  label: string;
  detail?: string;
  version?: string | number | null;
  status?: string | null;
  superseded?: boolean;
  href?: string;
  relation?: string;
  category?: RelationCategory;
  creator?: "code" | "human" | "model";
  recordId?: string;
  at?: string | null;
  children: LineageNode[];
}

/**
 * Finding → analysis → metric/filter → dataset → mapping → snapshot → source, plus context package → rules/BPMN → documents.
 * Built from authoritative PostgreSQL records, so it is always available even when the graph projection lags.
 */
export async function findingLineage(viewer: Viewer, projectId: string, findingId: string): Promise<LineageNode> {
  const f = await getFinding(viewer, projectId, findingId);
  const base = `/lite/projects/${projectId}`;
  const q = db();
  const run = (await q.query(`SELECT id, created_at, completed_at, algorithm_version, filter_spec, monitoring_config_id FROM analysis_runs WHERE id = $1`, [f.analysisRunId])).rows[0];
  const ds = (await q.query(
    `SELECT d.id, d.name, d.version, d.status, d.content_hash, d.published_at, d.mapping_version_id, m.version AS mapping_version, m.config, m.created_at AS mapping_at,
            s.id AS snapshot_id, s.file_name, s.sha256, s.created_at AS snapshot_at, so.id AS source_id, so.name AS source_name
       FROM dataset_versions d JOIN mapping_versions m ON m.id = d.mapping_version_id JOIN source_snapshots s ON s.id = d.snapshot_id JOIN sources so ON so.id = d.source_id
      WHERE d.id = $1`, [f.datasetVersionId],
  )).rows[0];
  const pkg = (await q.query(`SELECT id, name, version, status, hash, activated_at FROM context_packages WHERE id = $1`, [f.contextPackageId])).rows[0];
  const refs = (await q.query<{ ref_type: string; ref_id: string; ref_key: string; ref_version: number }>(
    `SELECT ref_type, ref_id, ref_key, ref_version FROM context_package_refs WHERE package_id = $1 ORDER BY ref_type, ref_key`, [pkg.id],
  )).rows;
  const docOf = async (table: string, id: string) => (await q.query<{ id: string; title: string; reference: string; version: string; source_reference: string }>(
    `SELECT d.id, d.title, d.reference, d.version, x.source_reference FROM ${table} x LEFT JOIN context_documents d ON d.id = x.source_document_id WHERE x.id = $1`, [id],
  )).rows[0];

  const contextChildren: LineageNode[] = [];
  for (const r of refs) {
    if (!["rule", "process_boundary", "rework_definition", "bpmn_model", "bpmn_mapping"].includes(r.ref_type)) continue;
    const table = { rule: "rules", process_boundary: "process_boundaries", rework_definition: "rework_definitions", bpmn_model: "bpmn_models", bpmn_mapping: null }[r.ref_type];
    const doc = table ? await docOf(table, r.ref_id) : undefined;
    const ruleIsSubject = r.ref_type === "rule" && f.subject.ruleId === r.ref_id;
    contextChildren.push({
      id: `${r.ref_type}:${r.ref_id}`, type: r.ref_type, label: `${LABEL[r.ref_type] ?? r.ref_type} ${r.ref_key}`, version: r.ref_version,
      relation: ruleIsSubject ? "EVALUATED_AGAINST" : "CITES", category: "lineage", creator: "human", recordId: r.ref_id, href: `${base}/prepare/context`,
      children: doc?.id ? [{ id: `document:${doc.id}`, type: "document", label: doc.title, detail: doc.reference, version: doc.version, relation: "CITES", category: "lineage", creator: "human", recordId: doc.id, href: `${base}/prepare/context`, children: [] }]
        : doc?.source_reference ? [{ id: `ref:${r.ref_id}`, type: "source_reference", label: doc.source_reference, relation: "CITES", category: "lineage", creator: "human", children: [] }] : [],
    });
  }

  const repair = (ds.config.repairRules ?? []) as { checks: string[] }[];
  return {
    id: `finding:${f.id}`, type: "finding", label: f.title, detail: f.summary, status: f.severityLabel, creator: "code", recordId: f.id, at: f.createdAt, href: `${base}/findings/${f.id}`, children: [
      {
        id: `analysis:${run.id}`, type: "analysis", label: "Analysis run", detail: `${run.algorithm_version}`, relation: "DERIVED_FROM", category: "lineage", creator: "code", recordId: run.id,
        at: run.completed_at, href: `${base}/analysis?run=${run.id}`, children: [
          { id: `metric:${f.metricKey}:${f.metricVersion}`, type: "metric_definition", label: f.metricName ?? f.metricKey, detail: f.formula, version: f.metricVersion, relation: "COMPUTED_WITH", category: "lineage", creator: "code", children: [] },
          { id: `filter:${run.id}`, type: "filter", label: "Filter analisis", detail: JSON.stringify(run.filter_spec), relation: "COMPUTED_WITH", category: "lineage", creator: "human", children: [] },
          {
            id: `dataset:${ds.id}`, type: "dataset_version", label: ds.name, detail: `hash ${ds.content_hash.slice(0, 12)}`, version: ds.version, status: ds.status, superseded: ds.status === "superseded",
            relation: "DERIVED_FROM", category: "lineage", creator: "code", recordId: ds.id, at: ds.published_at, href: `${base}/prepare/datasets/${ds.id}`, children: [
              {
                id: `mapping:${ds.mapping_version_id}`, type: "mapping_version", label: `Mapping v${ds.mapping_version}`, detail: `${Object.keys(ds.config.labelMap ?? {}).length} label · ${repair.length ? `aturan perbaikan: ${repair.flatMap((r) => r.checks).join(", ")}` : "tanpa aturan perbaikan"}`,
                version: ds.mapping_version, relation: "USES_MAPPING", category: "lineage", creator: "human", recordId: ds.mapping_version_id, at: ds.mapping_at, href: `${base}/prepare/sources/${ds.source_id}?mapping=${ds.mapping_version_id}`, children: [],
              },
              {
                id: `snapshot:${ds.snapshot_id}`, type: "snapshot", label: ds.file_name, detail: `sha256 ${String(ds.sha256).slice(0, 12)}`, relation: "DERIVED_FROM", category: "lineage", creator: "human",
                recordId: ds.snapshot_id, at: ds.snapshot_at, href: `${base}/prepare/sources/${ds.source_id}?snapshot=${ds.snapshot_id}`, children: [
                  { id: `source:${ds.source_id}`, type: "source", label: ds.source_name, relation: "DERIVED_FROM", category: "lineage", creator: "human", recordId: ds.source_id, href: `${base}/prepare/sources/${ds.source_id}`, children: [] },
                ],
              },
            ],
          },
          {
            id: `context:${pkg.id}`, type: "context_package", label: pkg.name, detail: `hash ${pkg.hash.slice(0, 12)}`, version: pkg.version, status: pkg.status, superseded: pkg.status === "superseded",
            relation: "EVALUATED_AGAINST", category: "lineage", creator: "human", recordId: pkg.id, at: pkg.activated_at, href: `${base}/prepare/context`, children: contextChildren,
          },
        ],
      },
    ],
  };
}

const LABEL: Record<string, string> = { rule: "Aturan", process_boundary: "Batas proses", rework_definition: "Definisi rework", bpmn_model: "Model BPMN", bpmn_mapping: "Pemetaan BPMN" };
