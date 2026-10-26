import "server-only";
import type { Viewer } from "./auth";
import type { FilterSpec, MappingConfig } from "@nora/contracts";
import { jsonAs } from "@nora/db";
import { QUALITY_CHECK_LABEL } from "./data";
import { db } from "./db";
import { describeFilter, formatInt } from "./format";
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
  /** identifiers for auditors (hashes, algorithm versions); shown on hover, not in the text */
  technical?: string;
  children: LineageNode[];
}

/**
 * Finding → analysis → metric/filter → dataset → mapping → snapshot → source, plus context package → rules/BPMN → documents.
 * Built from authoritative PostgreSQL records, so it is always available even when the graph projection lags.
 */
export async function findingLineage(viewer: Viewer, projectId: string, findingId: string): Promise<LineageNode> {
  const f = await getFinding(viewer, projectId, findingId);
  const base = `/projects/${projectId}`;
  const q = db();
  const run = await q.analysisRun.findUniqueOrThrow({ where: { id: f.analysisRunId }, select: { id: true, completedAt: true, algorithmVersion: true, filterSpec: true } });
  const ds = await q.datasetVersion.findUniqueOrThrow({
    where: { id: f.datasetVersionId },
    select: {
      id: true, name: true, version: true, status: true, contentHash: true, publishedAt: true, caseCount: true, eventCount: true, mappingVersionId: true, snapshotId: true, sourceId: true,
      mappingVersion: { select: { version: true, config: true, createdAt: true } }, snapshot: { select: { fileName: true, sha256: true, createdAt: true } }, source: { select: { name: true } },
    },
  });
  const pkg = await q.contextPackage.findUniqueOrThrow({ where: { id: f.contextPackageId }, select: { id: true, name: true, version: true, status: true, hash: true, activatedAt: true } });
  const refs = await q.contextPackageRef.findMany({ where: { packageId: pkg.id }, orderBy: [{ refType: "asc" }, { refKey: "asc" }], select: { refType: true, refId: true, refKey: true, refVersion: true } });
  const DOC = { sourceReference: true, sourceDocument: { select: { id: true, title: true, reference: true, version: true } } } as const;
  const docOf = (type: string, id: string) => {
    switch (type) {
      case "rule": return q.rule.findUnique({ where: { id }, select: DOC });
      case "process_boundary": return q.processBoundary.findUnique({ where: { id }, select: DOC });
      case "rework_definition": return q.reworkDefinition.findUnique({ where: { id }, select: DOC });
      case "bpmn_model": return q.bpmnModel.findUnique({ where: { id }, select: DOC });
      default: return null;
    }
  };
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const config = jsonAs<Partial<MappingConfig>>(ds.mappingVersion.config);

  const contextChildren: LineageNode[] = [];
  for (const r of refs) {
    if (!["rule", "process_boundary", "rework_definition", "bpmn_model", "bpmn_mapping"].includes(r.refType)) continue;
    const rec = await docOf(r.refType, r.refId);
    const doc = rec?.sourceDocument;
    const ruleIsSubject = r.refType === "rule" && f.subject.ruleId === r.refId;
    contextChildren.push({
      id: `${r.refType}:${r.refId}`, type: r.refType, label: `${LABEL[r.refType] ?? r.refType} ${r.refKey}`, version: r.refVersion,
      relation: ruleIsSubject ? "EVALUATED_AGAINST" : "CITES", category: "lineage", creator: "human", recordId: r.refId, href: `${base}/prepare/context`,
      children: doc?.id ? [{ id: `document:${doc.id}`, type: "document", label: doc.title, detail: doc.reference, version: doc.version, relation: "CITES", category: "lineage", creator: "human", recordId: doc.id, href: `${base}/prepare/context`, children: [] }]
        : rec?.sourceReference ? [{ id: `ref:${r.refId}`, type: "source_reference", label: rec.sourceReference, relation: "CITES", category: "lineage", creator: "human", children: [] }] : [],
    });
  }

  const repair = config.repairRules ?? [];
  return {
    id: `finding:${f.id}`, type: "finding", label: f.title, detail: f.summary, status: f.severityLabel, creator: "code", recordId: f.id, at: f.createdAt, href: `${base}/findings/${f.id}`, children: [
      {
        id: `analysis:${run.id}`, type: "analysis", label: "Analisis proses", detail: "Peta proses dan metrik dihitung otomatis dari dataset di bawah", technical: `algoritma ${run.algorithmVersion}`, relation: "DERIVED_FROM", category: "lineage", creator: "code", recordId: run.id,
        at: iso(run.completedAt), href: `${base}/analysis?run=${run.id}`, children: [
          { id: `metric:${f.metricKey}:${f.metricVersion}`, type: "metric_definition", label: f.metricName ?? f.metricKey, detail: f.formula ?? undefined, version: f.metricVersion, relation: "COMPUTED_WITH", category: "lineage", creator: "code", children: [] },
          { id: `filter:${run.id}`, type: "filter", label: "Filter analisis", detail: describeFilter(jsonAs<Partial<FilterSpec>>(run.filterSpec)), relation: "COMPUTED_WITH", category: "lineage", creator: "human", children: [] },
          {
            id: `dataset:${ds.id}`, type: "dataset_version", label: ds.name, detail: `${formatInt(Number(ds.caseCount))} kasus · ${formatInt(Number(ds.eventCount))} event`, technical: `hash ${ds.contentHash.slice(0, 12)}`, version: ds.version, status: ds.status, superseded: ds.status === "superseded",
            relation: "DERIVED_FROM", category: "lineage", creator: "code", recordId: ds.id, at: iso(ds.publishedAt), href: `${base}/prepare/datasets/${ds.id}`, children: [
              {
                id: `mapping:${ds.mappingVersionId}`, type: "mapping_version", label: `Pemetaan kolom v${ds.mappingVersion.version}`, detail: `${Object.keys(config.labelMap ?? {}).length} penyeragaman nama aktivitas · ${repair.length ? `perbaikan data: ${repair.flatMap((r) => r.checks).map((c) => QUALITY_CHECK_LABEL[c] ?? c).join(", ")}` : "tanpa perbaikan data"}`,
                version: ds.mappingVersion.version, relation: "USES_MAPPING", category: "lineage", creator: "human", recordId: ds.mappingVersionId, at: iso(ds.mappingVersion.createdAt), href: `${base}/prepare/sources/${ds.sourceId}?mapping=${ds.mappingVersionId}`, children: [],
              },
              {
                id: `snapshot:${ds.snapshotId}`, type: "snapshot", label: ds.snapshot.fileName, detail: "File yang diunggah", technical: `sha256 ${String(ds.snapshot.sha256).slice(0, 12)}`, relation: "DERIVED_FROM", category: "lineage", creator: "human",
                recordId: ds.snapshotId, at: iso(ds.snapshot.createdAt), href: `${base}/prepare/sources/${ds.sourceId}?snapshot=${ds.snapshotId}`, children: [
                  { id: `source:${ds.sourceId}`, type: "source", label: ds.source.name, relation: "DERIVED_FROM", category: "lineage", creator: "human", recordId: ds.sourceId, href: `${base}/prepare/sources/${ds.sourceId}`, children: [] },
                ],
              },
            ],
          },
          {
            id: `context:${pkg.id}`, type: "context_package", label: pkg.name, detail: "Batas proses, aturan dan katalog yang dipakai saat analisis", technical: `hash ${pkg.hash.slice(0, 12)}`, version: pkg.version, status: pkg.status, superseded: pkg.status === "superseded",
            relation: "EVALUATED_AGAINST", category: "lineage", creator: "human", recordId: pkg.id, at: iso(pkg.activatedAt), href: `${base}/prepare/context`, children: contextChildren,
          },
        ],
      },
    ],
  };
}

const LABEL: Record<string, string> = { rule: "Aturan", process_boundary: "Batas proses", rework_definition: "Definisi rework", bpmn_model: "Model BPMN", bpmn_mapping: "Pemetaan BPMN" };

/** The run's filter in words, e.g. "Kasus dengan periode 1 Jan 2026 – 31 Mar 2026; branch: Bandung". */
