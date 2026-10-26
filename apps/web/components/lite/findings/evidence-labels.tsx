"use client";

import { formatMetric, type FilterSpec } from "@nora/contracts";
import { describeFilter, formatDateTime } from "@/lib/lite/format";
import { DATASET, QUALITY } from "../prepare/status";
import { TYPE_LABEL as FINDING_TYPE_LABEL } from "./labels";

/** Enum values that show up inside evidence content. */
const VALUE_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.entries({ ...DATASET, ...QUALITY }).map(([k, v]) => [k, v.label.toLowerCase()])),
  seconds: "detik", ratio: "rasio", count: "jumlah", number: "angka",
};
/** Checksums are for auditors; the technical details keep them. */
const HIDDEN = new Set(["metricKey", "metricVersion", "metric", "hash", "contentHash", "sha256"]);

/** Relation from a record to the one under it, in words ("Temuan — berasal dari → Analisis"). */
export const RELATION_LABEL: Record<string, string> = {
  DERIVED_FROM: "berasal dari", COMPUTED_WITH: "dihitung dengan", USES_MAPPING: "memakai pemetaan", EVALUATED_AGAINST: "dinilai terhadap", CITES: "merujuk",
  OBSERVED_AT: "teramati pada", SUPPORTED_BY_CASE: "didukung kasus", CO_OCCURS_WITH: "diikuti oleh",
  MAY_EXPLAIN: "mungkin menjelaskan", SUPPORTS: "mendukung", CONTRADICTS: "bertentangan dengan",
  REVIEWED: "ditinjau", SUPERSEDES: "menggantikan",
};
export const relationLabel = (r: string) => RELATION_LABEL[r] ?? r.toLowerCase().replace(/_/g, " ");


/** What each evidence item is, for readers who never saw the data model. */
export const ITEM_LABEL: Record<string, string> = {
  finding: "Temuan", metric_value: "Angka terukur", metric_definition: "Definisi metrik", analysis: "Analisis", dataset_version: "Dataset",
  mapping_version: "Pemetaan kolom", snapshot: "File sumber", capability_matrix: "Kemampuan data", context_package: "Paket konteks", rule: "Aturan",
  document_excerpt: "Kutipan dokumen", rework_definition: "Definisi rework", conformance_summary: "Kesesuaian BPMN", case_summary: "Contoh kasus",
  hypothesis: "Hipotesis (belum terbukti)", intervention: "Intervensi katalog", rubric: "Rubrik penilaian", comparison_candidate: "Kandidat yang dibandingkan",
  assessment_result: "Hasil penilaian Jev",
};

/** Field names of evidence content and finding metrics. */
const KEY_LABEL: Record<string, string> = {
  title: "Judul", findingType: "Jenis temuan", summary: "Ringkasan", severityScore: "Skor keparahan", severityLabel: "Tingkat", population: "Populasi", thresholds: "Ambang",
  name: "Nama", formula: "Rumus", unit: "Satuan", filter: "Filter", coverage: "Cakupan", algorithm: "Algoritma", completedAt: "Selesai dihitung", createdAt: "Dibuat", publishedAt: "Diterbitkan", contentHash: "Hash isi", qualityStatus: "Kualitas data",
  events: "Event", cases: "Kasus", excludedEvents: "Event dikecualikan", status: "Status", labelRules: "Penyeragaman nama", repairRules: "Perbaikan data",
  fileName: "File", sha256: "Checksum", hash: "Hash", conformanceAvailable: "Kesesuaian BPMN tersedia", params: "Parameter", sourceReference: "Sumber",
  reference: "Referensi", excerpt: "Kutipan", fitness: "Fitness", mismatches: "Ketidaksesuaian", caseRef: "Kasus", durationSeconds: "Durasi kasus",
  key: "Kunci", statement: "Pernyataan", symptoms: "Gejala", requiredEvidence: "Bukti yang dibutuhkan", action: "Tindakan", prerequisites: "Prasyarat",
  successMetric: "Ukuran keberhasilan", criteria: "Kriteria", wait_seconds: "Tunggu transisi", repetitions: "Pengulangan",
  occurrences: "Kemunculan", caseCount: "Jumlah kasus", medianSeconds: "Median tunggu", p90Seconds: "P90 tunggu", totalSeconds: "Total tunggu",
  contributionShare: "Porsi dari total tunggu", affectedCaseShare: "Porsi kasus terdampak", delayExcess: "Kelebihan tunda", rank: "Peringkat",
  caseShare: "Porsi kasus", avgRepetitions: "Rata-rata pengulangan", medianWithSeconds: "Median durasi dengan rework", medianWithoutSeconds: "Median durasi tanpa rework",
  nonCompliant: "Tidak patuh", compliant: "Patuh", notEvaluable: "Tidak dapat dievaluasi", nonCompliantShare: "Porsi tidak patuh",
  caseDuration: "Durasi kasus", meanSeconds: "Rata-rata", datasetCases: "Kasus dataset", datasetEvents: "Event dataset", mapAvailable: "Peta proses tersedia",
  comparison: "Perbandingan", serviceTime: "Waktu kerja aktivitas", processBoundary: "Batas proses", processDiscovery: "Penemuan proses", resourceAnalysis: "Analisis sumber daya",
  periodStart: "Periode mulai", periodEnd: "Periode selesai", smallSample: "Sampel kecil", topK: "Jumlah teratas", minP90Seconds: "P90 tunggu minimum", minSupportCases: "Kasus pendukung minimum",
};
export const keyLabel = (k: string) => KEY_LABEL[k] ?? k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

const unitOf = (k: string) => (/Seconds$|_seconds$/.test(k) ? "seconds" : /(Share|fitness)$/i.test(k) ? "ratio" : "number");

/** A value as text: numbers with units, lists joined, small objects as "a: b". */
export function formatValue(k: string, v: unknown): string {
  if (v == null || v === "") return "–";
  // Graph props arrive with objects stringified.
  if (typeof v === "string" && /^[[{]/.test(v)) { try { return formatValue(k, JSON.parse(v)); } catch { /* plain text */ } }
  if (k === "filter" && typeof v === "object") return describeFilter(v as Partial<FilterSpec>);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  if (k === "findingType" && typeof v === "string") return FINDING_TYPE_LABEL[v] ?? v;
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "string") return VALUE_LABEL[v] ?? v;
  if (typeof v === "number") return formatMetric({ value: v, unit: unitOf(k) });
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x ? formatObject(x as Record<string, unknown>) : String(x))).join(" · ") : "–";
  if (typeof v === "object") {
    // Capability entries: {level, reason, available}; the reason already says it in words.
    const o = v as Record<string, unknown>;
    if (typeof o.available === "boolean" && typeof o.reason === "string") return o.available ? o.reason.replace(/\.$/, "") : `Tidak tersedia — ${o.reason.replace(/\.$/, "")}`;
    return formatObject(o);
  }
  return String(v);
}
const formatObject = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([, x]) => x != null && !(Array.isArray(x) && !x.length)).map(([k, x]) => `${keyLabel(k)}: ${formatValue(k, x)}`).join(", ") || "–";

/** Evidence content as a short readable list; metric items read as one sentence. */
export function EvidenceContent({ type, content }: { type: string; content: Record<string, unknown> }) {
  if (type === "metric_value" && typeof content.metric === "string") {
    return <p className="text-sm"><span className="text-ink-2">{keyLabel(content.metric)}:</span> <span className="font-medium">{formatValue(content.metric, content.value)}</span></p>;
  }
  const rows = Object.entries(content).filter(([k, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !HIDDEN.has(k));
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{keyLabel(k)}</dt>
          <dd className="min-w-0 break-words text-ink">{formatValue(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}
