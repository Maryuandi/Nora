import { CONTEXT_PACK, DATASET_VERSION, TRANSITIONS, buildCases } from "./rec-cases";
import { DEFAULT_WEIGHTS, buildBaseline } from "./recommend";
import { runScenario } from "./scenario";
import type { JevResult, PriorityPolicy, RecCandidate, RecFinding, Scenario, TrialProposal } from "./types";

// All text below is invented demo data ("Data contoh"); real findings come from M06, assessments from M08.
export const recFindings: RecFinding[] = [
  {
    id: "f-approval", projectId: "p-p2p", title: "Persetujuan menumpuk pada satu approver",
    summary: "Waktu tunggu antara Create PO dan Approve PO melonjak karena sebagian besar PO bernilai menengah menunggu satu approver.",
    metrics: [
      { key: "wait_days_p90", label: "Waktu tunggu P90", value: 9.4, unit: "hari" },
      { key: "cases_affected", label: "Kasus terdampak", value: 312, unit: "kasus" },
      { key: "approval_load", label: "Beban approver utama", value: 71, unit: "%" },
      { key: "vendor_concentration", label: "Konsentrasi vendor", value: 0.32, unit: "rasio" },
    ],
    affectedShare: 0.62, waitShare: 0.48, supportCases: 45, activeRefs: { "kebijakan-approval": 3 },
  },
  {
    id: "f-rework", projectId: "p-p2p", title: "Rework pada Change Approval",
    summary: "Sekitar seperlima kasus mengulang Change Approval karena data PO tidak lengkap saat diajukan.",
    metrics: [
      { key: "rework_rate", label: "Tingkat rework", value: 22, unit: "%" },
      { key: "wait_days_p90", label: "Waktu tunggu P90", value: 5.1, unit: "hari" },
    ],
    affectedShare: 0.22, waitShare: 0.31, supportCases: 53, activeRefs: { "sop-change": 1 },
  },
];

const jev = (score: number, prob: number, conclusion: JevResult["conclusion"] = "relevan", status: JevResult["status"] = "otomatis"): JevResult => ({
  status, score, prob, conclusion,
  criteria: [{ label: "Kesesuaian dengan penyebab", level: Math.round(score / 25) + 1 }, { label: "Dukungan bukti", level: Math.round(prob * 4) + 1 }, { label: "Kelayakan penerapan", level: 3 }],
});
const NOT_RATED: JevResult = { status: "belum_dinilai", score: null, prob: null, conclusion: null, criteria: [] };

const base = (o: Partial<RecCandidate> & Pick<RecCandidate, "id" | "name">): RecCandidate => ({
  kind: "intervensi", origin: "katalog", proposeToCatalog: false, description: "", addresses: "", successMetric: "",
  findingIds: ["f-approval"], conditions: [], refMetrics: [{ metricKey: "wait_days_p90", expected: 9.4 }],
  refs: [{ key: "kebijakan-approval", version: 3 }], ownerRole: "pemilik_proses", effort: null, risk: null, prerequisites: [], exclusions: [], jev: {}, ...o,
});

export const recCandidates: RecCandidate[] = [
  base({ id: "k-delegasi", name: "Delegasi persetujuan di bawah batas nilai", addresses: "Antrean persetujuan PO bernilai menengah pada satu approver",
    description: "PO di bawah batas nilai tertentu boleh disetujui oleh approver cadangan.", successMetric: "Waktu tunggu P90 Create PO → Approve PO",
    conditions: [{ label: "Beban approver utama ≥ 50%", metricKey: "approval_load", op: ">=", value: 50 }], effort: 2, risk: 2,
    prerequisites: ["Batas nilai disepakati klien", "Approver cadangan terdaftar"], exclusions: ["PO di atas batas nilai"], jev: { "f-approval": jev(85, 0.85) } }),
  base({ id: "k-cadangan", name: "Tambah approver cadangan", addresses: "Satu titik kegagalan pada approver utama", successMetric: "Beban approver utama",
    conditions: [{ label: "Beban approver utama ≥ 60%", metricKey: "approval_load", op: ">=", value: 60 }], effort: 3, risk: 1,
    prerequisites: ["Kandidat approver tersedia"], jev: { "f-approval": jev(78, 0.8) } }),
  base({ id: "k-otomatisasi", name: "Otomatisasi persetujuan nilai kecil", addresses: "Persetujuan manual untuk PO bernilai kecil", successMetric: "Persentase PO tanpa persetujuan manual",
    conditions: [{ label: "Waktu tunggu P90 ≥ 5 hari", metricKey: "wait_days_p90", op: ">=", value: 5 }], effort: 4, risk: 3,
    prerequisites: ["Integrasi ERP", "Persetujuan tim kepatuhan"], exclusions: ["Vendor baru"], jev: { "f-approval": jev(92, 0.88) } }),
  base({ id: "k-eskalasi", name: "Batas waktu persetujuan dan eskalasi", addresses: "PO menunggu tanpa batas waktu", successMetric: "Persentase PO disetujui dalam 3 hari",
    conditions: [{ label: "Waktu tunggu P90 ≥ 5 hari", metricKey: "wait_days_p90", op: ">=", value: 5 }], jev: { "f-approval": jev(55, 0.65, "sebagian_relevan") } }),
  base({ id: "k-audit", name: "Audit pola persetujuan tengah malam", addresses: "Dugaan persetujuan massal di luar jam kerja", successMetric: "Persentase persetujuan di luar jam kerja",
    conditions: [{ label: "Persetujuan di luar jam kerja > 10%", metricKey: "after_hours_share", op: ">", value: 0.1 }], effort: 1, risk: 1, jev: { "f-approval": NOT_RATED } }),
  base({ id: "k-vendor", name: "Pecah vendor besar", addresses: "Ketergantungan pada vendor yang dominan", successMetric: "Konsentrasi vendor",
    conditions: [{ label: "Konsentrasi vendor ≥ 0,6", metricKey: "vendor_concentration", op: ">=", value: 0.6 }], effort: 5, risk: 4, jev: { "f-approval": jev(40, 0.5, "sebagian_relevan") } }),
  base({ id: "k-rotasi", name: "Rotasi approver mingguan", addresses: "Beban persetujuan tidak merata", successMetric: "Sebaran beban approver",
    conditions: [{ label: "Beban approver utama ≥ 50%", metricKey: "approval_load", op: ">=", value: 50 }], refs: [{ key: "kebijakan-approval", version: 2 }], effort: 2, risk: 2,
    jev: { "f-approval": jev(70, 0.75) } }),
  base({ id: "k-awalpekan", name: "Pindahkan persetujuan ke awal pekan", origin: "analis", proposeToCatalog: true, kind: "hipotesis",
    description: "Lonjakan pengajuan hari Jumat membuat antrean menumpuk hingga Senin.", addresses: "Lonjakan pengajuan akhir pekan", successMetric: "Waktu tunggu P90",
    effort: 1, risk: 2, jev: { "f-approval": jev(60, 0.55, "sebagian_relevan", "perlu_review") } }),
  base({ id: "k-templat", findingIds: ["f-rework"], name: "Templat pengajuan PO dengan kolom wajib", addresses: "Data PO tidak lengkap saat diajukan", successMetric: "Tingkat rework Change Approval",
    conditions: [{ label: "Tingkat rework ≥ 15%", metricKey: "rework_rate", op: ">=", value: 15 }], refMetrics: [{ metricKey: "rework_rate", expected: 22 }],
    refs: [{ key: "sop-change", version: 1 }], effort: 2, risk: 1, jev: { "f-rework": jev(88, 0.9) } }),
  base({ id: "k-validasi", findingIds: ["f-rework"], name: "Validasi otomatis sebelum pengajuan", addresses: "Kesalahan input yang baru terlihat saat persetujuan", successMetric: "Tingkat rework Change Approval",
    conditions: [{ label: "Tingkat rework ≥ 15%", metricKey: "rework_rate", op: ">=", value: 15 }], refMetrics: [{ metricKey: "rework_rate", expected: 22 }],
    refs: [{ key: "sop-change", version: 1 }], effort: 4, risk: 2, jev: { "f-rework": jev(80, 0.82) } }),
  base({ id: "k-pelatihan", findingIds: ["f-rework"], name: "Pelatihan pengaju PO", addresses: "Pengaju belum paham kolom wajib", successMetric: "Tingkat rework Change Approval",
    conditions: [{ label: "Tingkat rework ≥ 15%", metricKey: "rework_rate", op: ">=", value: 15 }], refMetrics: [{ metricKey: "rework_rate", expected: 22 }],
    refs: [{ key: "sop-change", version: 1 }], effort: 2, risk: 1, jev: { "f-rework": NOT_RATED } }),
];

export const priorityPolicies: PriorityPolicy[] = [
  { projectId: "p-p2p", version: 1, weights: { ...DEFAULT_WEIGHTS }, changedBy: "u-dimas", changedAt: "2026-10-10T03:00:00Z", note: "Bobot bawaan PRD M09" },
];

const demoSpec = { kind: "kurangi_jeda", transition: TRANSITIONS[0], pct: 50 } as const;
export const scenarios: Scenario[] = [
  { id: "sc-demo", projectId: "p-p2p", name: "Jeda Create PO → Approve PO turun 50%", spec: demoSpec, datasetVersion: DATASET_VERSION, contextPack: CONTEXT_PACK,
    status: "estimasi", result: runScenario(demoSpec, buildCases()), createdBy: "u-dimas", createdAt: "2026-10-15T03:00:00Z" },
];

const delegasi = recCandidates[0], f1 = recFindings[0];
export const trials: TrialProposal[] = [
  { id: "t-demo", projectId: "p-p2p", findingId: f1.id, candidateId: delegasi.id, status: "draf",
    action: delegasi.name, scope: "", durationWeeks: null, successMetric: delegasi.successMetric, baseline: buildBaseline(delegasi, f1),
    target: "", guardrails: ["Kepatuhan persetujuan tidak turun"], owner: "", risks: [], stopConditions: [],
    createdBy: "u-dimas", createdAt: "2026-10-16T03:00:00Z", updatedAt: "2026-10-16T03:00:00Z" },
];
