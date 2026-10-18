import type { BundleItem, EvidenceBundle, GraphEdge, GraphNode, GraphNodeKind, GraphStatus, MockState, RelationCategory, RelationCreator, TraceFinding } from "./types";

const P = "p-p2p";
const explore = (id: string) => `/projects/${P}/trace/explore?node=${id}`;
const n = (id: string, kind: GraphNodeKind, label: string, module: GraphNode["module"], href: string | null, sublabel?: string): GraphNode =>
  ({ id, projectId: P, kind, label, module, href, ...(sublabel ? { sublabel } : {}) });

const graphNodes: GraphNode[] = [
  n("f-sla", "Finding", "Durasi PO ke Goods Receipt melewati SLA di 23% kasus", "M06", `/projects/${P}/trace/findings/f-sla`),
  n("f-idle", "Finding", "Antrean Clear Invoice menumpuk akhir bulan", "M06", `/projects/${P}/trace/findings/f-idle`),
  n("an-q3", "Analysis", "Peta proses Q3", "M05", null),
  n("md-cycle", "MetricDefinition", "Waktu siklus PO→GR", "M06", null, "filter: semua kasus"),
  n("doc-sop", "Document", "SOP Procure-to-Pay · Bagian 4.2", "M04", null),
  n("act-po", "Activity", "Create Purchase Order Item", "M03", explore("act-po")),
  n("act-gr", "Activity", "Record Goods Receipt", "M03", explore("act-gr")),
  n("act-ci", "Activity", "Clear Invoice", "M03", explore("act-ci")),
  n("tr-gr-ci", "Transition", "Record Goods Receipt → Clear Invoice", "M03", explore("tr-gr-ci")),
  n("hyp-approval", "Hypothesis", "Persetujuan manual memperlambat PO", "M04", null),
  n("int-double", "Intervention", "Approval ganda otomatis", "M04", null),
  n("as-jev-1", "Assessment", "Penilaian Jev untuk f-sla", "M08", null),
  n("as-jev-2", "Assessment", "Penilaian Jev untuk f-idle", "M08", null),
  n("b-1", "EvidenceBundle", "Paket bukti penilaian 1", "M07", `/projects/${P}/trace/bundles/b-1`),
  n("b-2", "EvidenceBundle", "Paket bukti penilaian 2", "M07", `/projects/${P}/trace/bundles/b-2`),
  n("dec-1", "Decision", "Uji coba approval ganda ditunda", "M11", null),
];

let seq = 0;
const e = (from: string, type: string, to: string, category: RelationCategory, createdBy: RelationCreator): GraphEdge => {
  seq += 1;
  return { id: `e-${seq}`, projectId: P, from, to, type, category, createdBy, status: "aktif", recordId: `rec-${1000 + seq}`, at: `2026-10-${10 + (seq % 8)}T03:00:00Z` };
};

const graphEdges: GraphEdge[] = [
  e("f-sla", "DERIVED_FROM", "an-q3", "asal_usul", "sistem"),
  e("an-q3", "COMPUTED_WITH", "md-cycle", "asal_usul", "sistem"),
  e("an-q3", "USES_MAPPING", "m-1", "asal_usul", "sistem"),
  e("f-sla", "EVALUATED_AGAINST", "r-sla-1", "asal_usul", "sistem"),
  e("r-sla-1", "CITES", "doc-sop", "asal_usul", "sistem"),
  e("r-sla-2", "CITES", "doc-sop", "asal_usul", "sistem"),
  e("f-sla", "OBSERVED_AT", "act-po", "observasi", "sistem"),
  e("f-sla", "OBSERVED_AT", "act-gr", "observasi", "sistem"),
  e("act-gr", "CO_OCCURS_WITH", "act-ci", "observasi", "sistem"),
  e("f-idle", "DERIVED_FROM", "an-q3", "asal_usul", "sistem"),
  e("f-idle", "OBSERVED_AT", "tr-gr-ci", "observasi", "sistem"),
  e("hyp-approval", "MAY_EXPLAIN", "f-sla", "dukungan_hipotesis", "model"),
  e("hyp-approval", "MAY_EXPLAIN", "act-gr", "dukungan_hipotesis", "model"),
  e("int-double", "SUPPORTS", "hyp-approval", "dukungan_hipotesis", "pengguna"),
  e("dec-1", "REVIEWED", "hyp-approval", "keputusan", "pengguna"),
  e("b-1", "DERIVED_FROM", "f-sla", "asal_usul", "sistem"),
  e("as-jev-1", "DERIVED_FROM", "b-1", "asal_usul", "sistem"),
  e("as-jev-1", "SUPPORTS", "hyp-approval", "dukungan_hipotesis", "model"),
  e("b-2", "DERIVED_FROM", "f-idle", "asal_usul", "sistem"),
  e("as-jev-2", "DERIVED_FROM", "b-2", "asal_usul", "sistem"),
];

const traceFindings: TraceFinding[] = [
  { id: "f-sla", projectId: P, title: "Durasi PO ke Goods Receipt melewati SLA di 23% kasus", metric: "Waktu siklus PO→GR", value: "23% melewati SLA", analysisId: "an-q3", at: "2026-10-14T03:00:00Z" },
  { id: "f-idle", projectId: P, title: "Antrean Clear Invoice menumpuk akhir bulan", metric: "Panjang antrean Clear Invoice", value: "+38% akhir bulan", analysisId: "an-q3", at: "2026-10-15T03:00:00Z" },
];

const it = (nodeId: string, version: number | null, kind: GraphNodeKind, summary: string, tokens: number): BundleItem => ({ nodeId, version, kind, summary, tokens });

const bundles: EvidenceBundle[] = [
  {
    id: "b-1", projectId: P, hash: "a3f9c01b7d42", target: "f-sla", purpose: "jev_assessment", requestedBy: "u-dimas", at: "2026-10-16T08:00:00Z",
    budget: { items: 10, tokens: 4000 },
    items: [
      it("f-sla", null, "Finding", "23% kasus melewati SLA PO ke Goods Receipt", 400),
      it("md-cycle", null, "MetricDefinition", "Waktu siklus PO→GR, semua kasus", 300),
      it("r-sla-2", 2, "Rule", "SLA ≤ 14 hari kerja, disetujui", 450),
      it("doc-sop", null, "Document", "SOP Procure-to-Pay Bagian 4.2", 600),
      it("act-gr", null, "Activity", "Record Goods Receipt", 200),
      it("hyp-approval", null, "Hypothesis", "Persetujuan manual memperlambat PO", 350),
      it("int-double", null, "Intervention", "Approval ganda otomatis", 250),
    ],
    excluded: [
      { nodeId: "r-urutan", reason: "dikecualikan karena anggaran", kind: "Rule" },
      { nodeId: "act-ci", reason: "dikecualikan karena anggaran", kind: "Activity" },
      { nodeId: "r-sod", reason: "di luar hak akses", kind: "Rule" },
    ],
    limitedContext: false, assessmentId: "as-jev-1",
  },
  {
    id: "b-2", projectId: P, hash: "7e10b5c9d2a8", target: "f-idle", purpose: "llm_interpretation", requestedBy: "u-dimas", at: "2026-10-17T02:00:00Z",
    budget: { items: 10, tokens: 4000 },
    items: [
      it("f-idle", null, "Finding", "Antrean Clear Invoice +38% akhir bulan", 350),
      it("tr-gr-ci", null, "Transition", "Record Goods Receipt → Clear Invoice", 250),
      it("an-q3", null, "Analysis", "Peta proses Q3", 300),
    ],
    excluded: [], limitedContext: true, assessmentId: "as-jev-2",
  },
];

const graphStatus: Record<string, GraphStatus> = {
  "p-p2p": { version: 7, projectedAt: "2026-10-17T09:29:20Z", authoritativeAt: "2026-10-17T09:30:00Z", failed: [], rebuilding: false },
  "p-o2c": { version: 3, projectedAt: "2026-10-17T09:18:00Z", authoritativeAt: "2026-10-17T09:30:00Z", failed: [{ eventId: "evt-0412", reason: "Neo4j timeout", attempts: 5 }], rebuilding: false },
};

export const graphSeed: Pick<MockState, "traceFindings" | "bundles" | "graphNodes" | "graphEdges" | "graphStatus"> = { traceFindings, bundles, graphNodes, graphEdges, graphStatus };
