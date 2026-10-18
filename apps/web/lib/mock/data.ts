import { FINDINGS } from "./interpretation-targets";
import { runCheckedGeneration, statusOf } from "./interpretation";
import { copyConfig } from "./metrics";
import type { AnalysisState, Audience, AuditEvent, Client, Comment, Decision, Interpretation, Investigation, InvestigationLink, InvestigationNote, Notification, Membership, MappingVersion, GoldItem, MockState, MonitoringConfig, MonitoringRun, Project, QuestionSpec, RuleSourceRef, RuleVersion, Snapshot, Source, User } from "./types";
import { graphSeed } from "./graph-data";
import { candidates, findings } from "./assessment-data";
import { runFixture } from "./assessment";
import { runClassFixture } from "./classification";
import { CLASS_FIXTURE, classItems } from "./classification-data";
import { DEFAULT_THRESHOLDS } from "./specs";

export const MOCK_TODAY = "2026-10-17";

const clients: Client[] = [
  { id: "c-manufaktur", name: "PT Contoh Manufaktur", sector: "Manufaktur", contact: "sari@contohmanufaktur.co.id" },
  { id: "c-retail", name: "PT Sejahtera Retail", sector: "Ritel", contact: "ops@sejahteraretail.co.id" },
  { id: "c-logistik", name: "PT Nusantara Logistik", sector: "Logistik", contact: "it@nusantaralogistik.co.id" },
];

const p = (o: Omit<Project, "statusHistory" | "description" | "retention"> & Partial<Project>): Project => ({
  description: "",
  retention: "Hapus 2 tahun setelah kontrak berakhir",
  statusHistory: [],
  ...o,
});

const projects: Project[] = [
  p({ id: "p-p2p", clientId: "c-manufaktur", name: "Purchase-to-Pay 2018", description: "Analisis proses pembelian berbasis data BPI Challenge 2019.",
    process: { name: "Purchase-to-Pay", startActivity: "Create Purchase Order Item", endActivity: "Clear Invoice" },
    contractStart: "2026-04-01", contractEnd: "2026-10-31", status: "aktif", lastActivityAt: "2026-10-17T08:12:00Z",
    statusHistory: [{ from: "draft", to: "aktif", reason: "Kontrak ditandatangani", at: "2026-04-01T02:00:00Z", by: "u-rina" }] }),
  p({ id: "p-o2c", clientId: "c-retail", name: "Order-to-Cash", process: { name: "Order-to-Cash", startActivity: "Create Order", endActivity: "Receive Payment" },
    contractStart: "2026-03-01", contractEnd: "2026-11-30", status: "ditangguhkan", lastActivityAt: "2026-10-10T04:30:00Z",
    statusHistory: [
      { from: "draft", to: "aktif", reason: "Kick-off proyek", at: "2026-03-01T02:00:00Z", by: "u-rina" },
      { from: "aktif", to: "ditangguhkan", reason: "Menunggu perpanjangan izin akses data", at: "2026-10-01T03:00:00Z", by: "u-rina" },
    ] }),
  p({ id: "p-procure", clientId: "c-manufaktur", name: "Procure-to-Pay Q3", process: { name: "Procure-to-Pay", startActivity: "", endActivity: "" },
    contractStart: "2026-11-01", contractEnd: "2027-04-30", status: "draft", lastActivityAt: "2026-10-16T09:00:00Z" }),
  p({ id: "p-incident", clientId: "c-logistik", name: "Incident-to-Resolution", process: { name: "Incident-to-Resolution", startActivity: "Ticket Opened", endActivity: "Ticket Closed" },
    contractStart: "2026-01-01", contractEnd: "2026-06-30", status: "berakhir", lastActivityAt: "2026-07-01T00:00:00Z",
    statusHistory: [
      { from: "draft", to: "aktif", reason: "Kick-off proyek", at: "2026-01-01T02:00:00Z", by: "u-rina" },
      { from: "aktif", to: "berakhir", reason: "Kontrak berakhir (pemeriksaan harian)", at: "2026-07-01T00:00:00Z", by: "system" },
    ] }),
  p({ id: "p-hr", clientId: "c-logistik", name: "Hire-to-Retire 2025", process: { name: "Hire-to-Retire", startActivity: "Requisition", endActivity: "Offboarding" },
    contractStart: "2025-01-01", contractEnd: "2025-12-31", status: "diarsipkan", lastActivityAt: "2026-02-01T00:00:00Z",
    statusHistory: [
      { from: "draft", to: "aktif", reason: "Kick-off proyek", at: "2025-01-01T02:00:00Z", by: "u-rina" },
      { from: "aktif", to: "berakhir", reason: "Kontrak berakhir", at: "2026-01-01T00:00:00Z", by: "system" },
      { from: "berakhir", to: "diarsipkan", reason: "Laporan akhir diserahkan", at: "2026-02-01T00:00:00Z", by: "u-rina" },
    ] }),
];

const users: User[] = [
  { id: "u-rina", name: "Rina Wulandari", email: "rina@javan.co.id", persona: "rina", pending: false },
  { id: "u-dimas", name: "Dimas Pratama", email: "dimas@javan.co.id", persona: "dimas", pending: false },
  { id: "u-sari", name: "Sari Hartono", email: "sari@contohmanufaktur.co.id", persona: "sari", pending: false },
  { id: "u-anton", name: "Anton Saputra", email: "anton@javan.co.id", persona: null, pending: false },
  { id: "u-lia", name: "Lia Kurniawan", email: "lia@javan.co.id", persona: null, pending: false },
  { id: "u-budi", name: "Budi Santoso", email: "budi@sejahteraretail.co.id", persona: null, pending: false },
  { id: "u-maya", name: "Maya Lestari", email: "maya@nusantaralogistik.co.id", persona: null, pending: false },
  { id: "u-yoga", name: "Yoga Firmansyah", email: "yoga@contohmanufaktur.co.id", persona: null, pending: true },
];

const m = (userId: string, projectId: string, role: Membership["role"], addedAt = "2026-04-01T02:00:00Z"): Membership => ({ userId, projectId, role, addedAt });

const memberships: Membership[] = [
  ...projects.map((pr) => m("u-rina", pr.id, "administrator", pr.contractStart + "T02:00:00Z")),
  m("u-dimas", "p-p2p", "analis"), m("u-dimas", "p-o2c", "analis"), m("u-dimas", "p-incident", "analis"),
  m("u-anton", "p-p2p", "analis"), m("u-lia", "p-o2c", "analis"), m("u-lia", "p-hr", "analis"),
  m("u-sari", "p-p2p", "pemilik_proses"), m("u-sari", "p-procure", "pemilik_proses"),
  m("u-yoga", "p-p2p", "pemilik_proses", "2026-10-15T03:00:00Z"),
  m("u-budi", "p-o2c", "pemilik_proses"), m("u-maya", "p-incident", "pemilik_proses"),
];

const ACTIONS: [string, string, string, AuditEvent["result"], string | null][] = [
  ["login", "Sesi", "Rina Wulandari", "sukses", null],
  ["analisis.jalankan", "Analisis", "Peta proses Q3", "sukses", "p-p2p"],
  ["data.baca", "Dataset", "BPI 2019 v3", "sukses", "p-p2p"],
  ["anggota.tambah", "Anggota", "Yoga Firmansyah", "sukses", "p-p2p"],
  ["data.baca", "Dataset", "Order lines v1", "ditolak", "p-o2c"],
  ["login", "Sesi", "dimas@javan.co.id", "gagal", null],
  ["sumber.konfigurasi", "Sumber data", "SAP export", "sukses", "p-p2p"],
  ["keputusan.catat", "Keputusan", "Uji coba approval ganda", "sukses", "p-p2p"],
  ["ekspor", "Laporan", "Ringkasan temuan Okt", "sukses", "p-p2p"],
  ["proyek.ubah", "Proyek", "Procure-to-Pay Q3", "sukses", "p-procure"],
];
const ACTORS = ["u-rina", "u-dimas", "u-anton", "u-sari", "u-lia"];

// ~40 events, newest first, spread back from MOCK_TODAY.
const audit: AuditEvent[] = Array.from({ length: 40 }, (_, i) => {
  const [action, objectType, objectLabel, result, projectId] = ACTIONS[i % ACTIONS.length];
  const at = new Date(Date.parse(`${MOCK_TODAY}T09:00:00Z`) - i * 5.5 * 3600_000).toISOString();
  return { id: `a-${40 - i}`, at, actorId: ACTORS[i % ACTORS.length], action, objectType, objectLabel, projectId, result };
});

const sources: Source[] = [
  { id: "s-p2p-sap", projectId: "p-p2p", name: "Ekspor SAP P2P", kind: "file", createdAt: "2026-04-05T03:00:00Z", createdBy: "u-dimas" },
  { id: "s-p2p-tiket", projectId: "p-p2p", name: "Log Tiket Lama", kind: "file", createdAt: "2026-04-10T03:00:00Z", createdBy: "u-anton" },
  { id: "s-o2c-erp", projectId: "p-o2c", name: "Ekspor ERP Order", kind: "file", createdAt: "2026-03-05T03:00:00Z", createdBy: "u-lia" },
];

const COLUMNS = [
  { name: "case_id", samples: ["PO-400112", "PO-400113", "PO-400114"] },
  { name: "activity", samples: ["Create Purchase Order Item", "Record Goods Receipt", "Clear Invoice"] },
  { name: "timestamp", samples: ["2026-09-01 08:14:00", "2026-09-03 10:02:00", "2026-09-12 15:40:00"] },
  { name: "resource", samples: ["user_017", "user_042", "batch_01"] },
];
const ACTS = ["Create Purchase Order Item", "Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"];
const PREVIEW = Array.from({ length: 12 }, (_, i) => [
  `PO-${400112 + Math.floor(i / 4)}`,
  ACTS[i % 4],
  `2026-09-${String(1 + i).padStart(2, "0")} ${String(8 + (i % 6)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`,
  ["user_017", "user_042", "user_008", "batch_01"][i % 4],
]);

// sn-1 also carries a vendor column (case_attr in the seed mapping) so M05b attribute filters are available on the seed.
// Sample names are the first 3 of VENDORS in eventlog.ts (duplicated: eventlog.ts imports mapping/rules, so importing it here risks a cycle).
const SAP_VENDORS = ["PT Sinar Jaya", "CV Mitra Abadi", "PT Nusantara Pratama"];
const SAP_COLUMNS = [...COLUMNS, { name: "vendor", samples: SAP_VENDORS }];
const SAP_PREVIEW = PREVIEW.map((r, i) => [...r, SAP_VENDORS[Math.floor(i / 4)]]);

const snapshots: Snapshot[] = [
  { id: "sn-1", sourceId: "s-p2p-sap", projectId: "p-p2p", fileName: "sap_p2p_okt2026.csv", sizeBytes: 12_582_912, format: "csv", checksum: "9f3a1c7e0b42",
    uploadedBy: "u-dimas", uploadedAt: "2026-10-15T07:30:00Z", status: "siap_dipetakan",
    stats: { rows: 57_195, rejected: 312, encoding: "UTF-8", delimiter: ",", timeFrom: "2026-01-02", timeTo: "2026-10-14", latestEventAt: "2026-10-14",
      newEvents: 57_195, duplicateEvents: 0, conflictEvents: 0 },
    columns: SAP_COLUMNS, preview: SAP_PREVIEW },
  { id: "sn-2", sourceId: "s-p2p-sap", projectId: "p-p2p", fileName: "sap_p2p_rusak_sep.csv", sizeBytes: 5_242_880, format: "csv", checksum: "c04b88d2a9e1",
    uploadedBy: "u-anton", uploadedAt: "2026-10-16T09:10:00Z", status: "perlu_tinjauan",
    stats: { rows: 23_831, rejected: 1_906, encoding: "UTF-8", delimiter: ";", timeFrom: "2026-09-01", timeTo: "2026-09-30", latestEventAt: "2026-09-30",
      newEvents: 14_251, duplicateEvents: 9_532, conflictEvents: 48 },
    columns: COLUMNS, preview: PREVIEW,
    errors: [
      { kind: "Format waktu tidak valid", count: 1_402, examples: [{ row: 310, text: "31/09/2026 08:14" }, { row: 1_877, text: "kemarin sore" }] },
      { kind: "Kolom wajib kosong (case_id)", count: 504, examples: [{ row: 912, text: ";Create Purchase Order Item;2026-09-04 09:00:00;user_017" }] },
    ] },
  { id: "sn-3", sourceId: "s-p2p-tiket", projectId: "p-p2p", fileName: "log_tiket_2026_q1.csv", sizeBytes: 3_145_728, format: "csv", checksum: "5e71d0aa3c96",
    uploadedBy: "u-anton", uploadedAt: "2026-08-22T04:00:00Z", status: "siap_dipetakan",
    stats: { rows: 14_300, rejected: 71, encoding: "UTF-8", delimiter: ",", timeFrom: "2026-01-05", timeTo: "2026-08-20", latestEventAt: "2026-08-20",
      newEvents: 14_300, duplicateEvents: 0, conflictEvents: 0 },
    columns: COLUMNS, preview: PREVIEW },
  { id: "sn-4", sourceId: "s-p2p-tiket", projectId: "p-p2p", fileName: "log_tiket_gagal.csv", sizeBytes: 819_200, format: "csv", checksum: "b2d6f41e87c5",
    uploadedBy: "u-dimas", uploadedAt: "2026-09-02T02:20:00Z", status: "gagal", failureReason: "Isi file bukan CSV yang valid",
    errors: [{ kind: "Struktur file tidak dikenali", count: 1, examples: [{ row: 1, text: "(berkas biner, bukan teks)" }] }] },
  { id: "sn-5", sourceId: "s-o2c-erp", projectId: "p-o2c", fileName: "order_cash_okt.xes", sizeBytes: 8_388_608, format: "xes", checksum: "7a09e3b5d148",
    uploadedBy: "u-lia", uploadedAt: "2026-10-05T06:45:00Z", status: "dibatalkan",
    stats: { rows: 38_130, rejected: 190, encoding: "UTF-8", delimiter: "-", timeFrom: "2026-03-01", timeTo: "2026-09-30", latestEventAt: "2026-09-30",
      newEvents: 38_130, duplicateEvents: 0, conflictEvents: 0 },
    columns: COLUMNS, preview: PREVIEW },
];

const mappings: MappingVersion[] = [
  { id: "m-1", sourceId: "s-p2p-sap", snapshotId: "sn-1", projectId: "p-p2p", version: 1,
    roles: { case_id: "case_id", activity: "activity", timestamp: "timestamp_end", resource: "resource", vendor: "case_attr" },
    timeFormat: "YYYY-MM-DD HH:mm:ss", timezone: "Asia/Jakarta",
    labels: [{ raw: "create purchase order item", canonical: "Create Purchase Order Item" }, { raw: "Record Goods Receipt ", canonical: "Record Goods Receipt" },
      { raw: "Cancel Invoice Receipt", canonical: null }],
    createdBy: "u-rina", createdAt: "2026-10-15T08:00:00Z" },
];

const sop = (section: string, quote: string): RuleSourceRef => ({ docTitle: "SOP Procure-to-Pay (contoh ilustratif)", section, quote });
const rule = (o: Partial<RuleVersion> & Pick<RuleVersion, "id" | "ruleKey" | "version" | "name" | "params" | "status" | "source">): RuleVersion => ({
  projectId: "p-p2p", description: "", scope: null, effectiveFrom: "2026-05-01", effectiveTo: null, clientConfirmed: false,
  createdBy: "u-dimas", createdAt: "2026-09-20T03:00:00Z", ...o,
});

const rules: RuleVersion[] = [
  rule({ id: "r-sla-1", ruleKey: "r-sla", version: 1, name: "Create Purchase Order Item ke Record Goods Receipt ≤ 14 hari kalender", status: "usang", effectiveTo: "2026-09-10",
    description: "Batas awal sebelum direvisi.", createdAt: "2026-09-01T03:00:00Z", approvedBy: "u-dimas", approvedAt: "2026-09-02T03:00:00Z",
    params: { type: "sla", from: "Create Purchase Order Item", to: "Record Goods Receipt", limit: 14, unit: "kalender" },
    source: sop("Bagian 4.2", "Barang harus diterima paling lambat 14 hari sejak PO dibuat.") }),
  rule({ id: "r-sla-2", ruleKey: "r-sla", version: 2, name: "Create Purchase Order Item ke Record Goods Receipt ≤ 14 hari kerja", status: "disetujui",
    description: "Satuan diperjelas menjadi hari kerja.", createdAt: "2026-09-10T03:00:00Z", effectiveFrom: "2026-09-11", approvedBy: "u-dimas", approvedAt: "2026-09-12T03:00:00Z", clientConfirmed: true,
    params: { type: "sla", from: "Create Purchase Order Item", to: "Record Goods Receipt", limit: 14, unit: "kerja" },
    source: sop("Bagian 4.2", "Barang harus diterima paling lambat 14 hari kerja sejak PO dibuat.") }),
  rule({ id: "r-urutan", ruleKey: "r-urutan", version: 1, name: "Record Goods Receipt sebelum Clear Invoice", status: "ditinjau",
    params: { type: "urutan", before: "Record Goods Receipt", after: "Clear Invoice" },
    source: sop("Bagian 5.1", "Faktur hanya boleh dilunasi setelah penerimaan barang dicatat.") }),
  rule({ id: "r-sod", ruleKey: "r-sod", version: 1, name: "Pembuat PO bukan penyetuju", status: "draf", createdBy: "u-anton", createdAt: "2026-10-12T03:00:00Z",
    params: { type: "pemisahan_tugas", activityA: "Create Purchase Order Item", activityB: "Record Goods Receipt" },
    source: sop("Bagian 6.3", "Orang yang membuat PO tidak boleh menyetujui penerimaan barang yang sama.") }),
  rule({ id: "r-terlarang", ruleKey: "r-terlarang", version: 1, name: "Tidak ada Record Invoice Receipt setelah Clear Invoice", status: "draf", createdAt: "2026-10-14T03:00:00Z",
    params: { type: "terlarang", activity: "Record Invoice Receipt" },
    source: sop("Bagian 5.4", "Faktur tidak boleh dicatat lagi setelah pelunasan.") }),
];

const p2pConfig: MonitoringConfig = {
  projectId: "p-p2p", version: 1, bottleneckTopN: 3, bottleneckP90Days: 5,
  reworkActivities: ["Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"],
  reworkHighPct: 15, complianceHighPct: 5, fitnessMin: 0.9, backlogAgeDays: 30, ageBuckets: [7, 30, 90],
  changePct: 20, minCasesChange: 30, minGroupCases: 100, smallSampleCases: 30,
  bpmnModel: { name: "P2P standar", activities: ["Create Purchase Order Item", "Record Goods Receipt", "Record Invoice Receipt", "Clear Invoice"] },
  updatedBy: "u-dimas", updatedAt: "2026-07-20T08:00:00Z",
};
const RUN_RULES = ["r-sla-1", "r-sla-2", "r-urutan"];
const frozen = (ids: string[]) => rules.filter((r) => ids.includes(r.id)).map((r) => ({ ...r }));
const runs: MonitoringRun[] = [
  { id: "run-1", projectId: "p-p2p", sourceId: "s-p2p-sap", snapshotId: "sn-1", mappingId: "m-1", periodFrom: "2026-05-01", periodTo: "2026-07-31",
    ruleVersionIds: RUN_RULES, ruleVersions: frozen(RUN_RULES), calendar: "bawaan_tiruan", config: copyConfig(p2pConfig), createdBy: "u-dimas", createdAt: "2026-08-01T03:00:00Z" },
  { id: "run-2", projectId: "p-p2p", sourceId: "s-p2p-sap", snapshotId: "sn-1", mappingId: "m-1", periodFrom: "2026-08-01", periodTo: "2026-10-14",
    ruleVersionIds: RUN_RULES, ruleVersions: frozen(RUN_RULES), calendar: "bawaan_tiruan", config: copyConfig(p2pConfig), createdBy: "u-anton", createdAt: "2026-10-15T09:00:00Z" },
];

const seedDraft = (n: string, findingId: string, audience: Audience, createdAt: string): Interpretation => {
  const attempts = runCheckedGeneration(FINDINGS.find((f) => f.id === findingId)!, audience);
  return {
    id: `i-seed-${n}`, projectId: "p-p2p", findingId, audience, status: statusOf(attempts, []), attempts, overrides: [],
    templateVersion: "tiruan-1", model: "model-tiruan", createdBy: "u-dimas", createdAt,
  };
};
const interpretations: Interpretation[] = [
  seedDraft("42", "finding_42", "pemilik_proses", "2026-10-15T08:00:00Z"),
  seedDraft("57", "finding_57", "pemilik_proses", "2026-10-16T08:00:00Z"),
  seedDraft("63", "finding_63", "analis", "2026-10-17T08:00:00Z"),
  seedDraft("71", "assess_71", "analis", "2026-10-17T10:00:00Z"),
  seedDraft("81", "compare_81", "pemilik_proses", "2026-10-17T14:00:00Z"),
  seedDraft("91", "scenario_91", "pemilik_proses", "2026-10-18T08:00:00Z"),
  seedDraft("95", "pilot_95", "analis", "2026-10-18T09:00:00Z"),
];

const analysisStates: AnalysisState[] = [
  { projectId: "p-p2p", datasetVersion: "ds-2", contextPackage: "ctx-4", analysis: "analisis-3", evidencePackage: "bukti-7",
    metricValues: { "finding_42.p90_days": 18.4 }, ruleVersions: { "r-sla": "v2" } },
];

const investigations: Investigation[] = [
  { id: "inv-1", projectId: "p-p2p", title: "Antrean persetujuan PO", question: "Mengapa persetujuan PO sering melewati batas waktu SLA?",
    originFindingId: "finding_42", status: "terbuka", ownerId: "u-dimas", memberIds: ["u-dimas", "u-sari"], createdAt: "2026-10-14T03:00:00Z" },
  { id: "inv-2", projectId: "p-p2p", title: "Rework verifikasi faktur", question: "Apa penyebab pengulangan pada verifikasi faktur?",
    originFindingId: "finding_57", status: "selesai", ownerId: "u-dimas", memberIds: ["u-dimas", "u-sari"], createdAt: "2026-10-10T03:00:00Z" },
];

const lk = (id: string, investigationId: string, kind: InvestigationLink["kind"], targetId: string, linkedVersion = "analisis-3", createdAt = "2026-10-14T03:00:00Z"): InvestigationLink =>
  ({ id, investigationId, kind, targetId, linkedVersion, createdBy: "u-dimas", createdAt });
const links: InvestigationLink[] = [
  lk("ln-1-1", "inv-1", "temuan", "finding_42"),
  lk("ln-1-2", "inv-1", "aturan", "r-sla", "v2"),
  lk("ln-1-3", "inv-1", "kandidat", "cand_1"),
  lk("ln-1-4", "inv-1", "kandidat", "cand_2"),
  lk("ln-1-5", "inv-1", "hasil_jev", "jev_42"),
  lk("ln-1-6", "inv-1", "interpretasi", "i-seed-42"),
  lk("ln-2-1", "inv-2", "temuan", "finding_57", "analisis-3", "2026-10-10T03:00:00Z"),
  lk("ln-2-2", "inv-2", "kandidat", "cand_3", "analisis-3", "2026-10-10T03:00:00Z"),
];

const notes: InvestigationNote[] = [
  { id: "note-1", investigationId: "inv-1", kind: "wawancara", title: "Wawancara Manajer Pengadaan",
    body: "Persetujuan PO menumpuk saat penyetuju utama cuti; tidak ada penyetuju cadangan.",
    interviewee: "Sari Hartono", intervieweeRole: "Manajer Pengadaan", interviewDate: "2026-10-14", initialsOnly: false,
    createdBy: "u-dimas", createdAt: "2026-10-14T09:00:00Z" },
  { id: "note-2", investigationId: "inv-1", kind: "hipotesis", title: "Penyetuju tunggal menjadi hambatan",
    body: "Antrean memanjang karena PO bernilai rendah tetap menunggu penyetuju yang sama.", hypothesisState: "belum_diuji", supportingLinkIds: [],
    createdBy: "u-dimas", createdAt: "2026-10-15T03:00:00Z" },
  { id: "note-3", investigationId: "inv-1", kind: "pertanyaan", title: "Berapa PO yang menunggu saat penyetuju cuti?",
    body: "Perlu data jumlah PO tertunda selama periode cuti penyetuju utama.", assigneeId: "u-dimas", questionState: "terbuka",
    createdBy: "u-dimas", createdAt: "2026-10-15T04:00:00Z" },
];

const comments: Comment[] = [
  { id: "cm-1", investigationId: "inv-1", targetLinkId: null, parentId: null,
    body: "@Dimas apakah kandidat penyetuju cadangan sudah dibahas dengan tim keuangan?", mentions: ["u-dimas"], resolved: false,
    createdBy: "u-sari", createdAt: "2026-10-16T07:00:00Z" },
];
const notifications: Notification[] = [
  { id: "ntf-1", userId: "u-dimas", projectId: "p-p2p", text: "Sari Hartono menyebut Anda di Antrean persetujuan PO",
    href: "/projects/p-p2p/investigations/inv-1", read: false, at: "2026-10-16T07:00:00Z" },
];

const decisions: Decision[] = [
  { id: "dc-1", investigationId: "inv-2", projectId: "p-p2p", targetLinkId: "ln-2-2", version: 1, status: "ditolak",
    reason: "Pemeriksaan otomatis tumpang tindih dengan kontrol yang sudah ada di sistem faktur.", byId: "u-dimas", byRole: "analis", at: "2026-10-16T10:00:00Z",
    snapshot: { datasetVersion: "ds-2", contextPackage: "ctx-4", analysis: "analisis-3", evidencePackage: "bukti-7", narrativeVersion: "i-seed-57",
      metricValues: { "finding_42.p90_days": 18.4 }, ruleVersions: { "r-sla": "v2" } } },
];

// c6 is not applicable and c9 is deliberately left unscored so the "Jalankan penilaian" button has work in the demo.
const assessments = findings.flatMap((f) =>
  runFixture(f, candidates.filter((c) => f.candidateIds.includes(c.id) && c.id !== "c9"), { runId: "run-seed", at: MOCK_TODAY + "T09:00:00Z" }));

const sp = (task: QuestionSpec["task"], question: string, cats: [string, string, string][]): QuestionSpec => ({
  id: `sp-${task}-1`, projectId: "p-p2p", task, version: 1, question,
  categories: cats.map(([key, label, definition]) => ({ key, label, definition })),
  thresholds: { ...DEFAULT_THRESHOLDS }, createdBy: "u-dimas", createdAt: MOCK_TODAY + "T09:00:00Z",
});

export const specs: QuestionSpec[] = [
  sp("relevansi", "Seberapa relevan kandidat ini sebagai penjelasan temuan?", []),
  sp("aktivitas", "Golongan apa yang paling tepat untuk aktivitas ini?", [
    ["persetujuan", "Persetujuan", "Aktivitas yang menyetujui atau menolak suatu dokumen atau permintaan."],
    ["pembuatan", "Pembuatan", "Aktivitas yang membuat dokumen atau transaksi baru."],
    ["perubahan", "Perubahan", "Aktivitas yang mengubah isi dokumen atau transaksi yang sudah ada."],
    ["pembatalan", "Pembatalan", "Aktivitas yang membatalkan atau menghapus dokumen atau transaksi."],
    ["penerimaan", "Penerimaan", "Aktivitas yang mencatat penerimaan barang atau jasa."],
    ["pencatatan_dokumen", "Pencatatan dokumen", "Aktivitas yang mencatat atau mengarsipkan dokumen pendukung."],
    ["pembayaran", "Pembayaran", "Aktivitas yang melakukan atau mengeluarkan pembayaran."],
    ["lainnya", "Lainnya", "Aktivitas yang tidak masuk golongan lain."],
  ]),
  sp("catatan", "Apa alasan utama yang tertulis pada catatan ini?", [
    ["harga_tidak_sesuai", "Harga tidak sesuai", "Harga pada dokumen berbeda dari kesepakatan atau pesanan."],
    ["kuantitas_tidak_sesuai", "Kuantitas tidak sesuai", "Jumlah barang berbeda antara pesanan, penerimaan, dan faktur."],
    ["dokumen_kurang", "Dokumen kurang", "Dokumen pendukung belum lengkap atau belum diterima."],
    ["vendor_salah", "Vendor salah", "Data vendor pada dokumen keliru atau tidak sesuai."],
    ["lainnya", "Lainnya", "Alasan yang tidak masuk kategori lain."],
  ]),
];

const classResults = (["aktivitas", "catatan"] as const).flatMap((task) =>
  runClassFixture(classItems.filter((i) => i.task === task), specs.find((x) => x.task === task)!, { runId: "run-seed-cls", at: MOCK_TODAY + "T09:00:00Z" }));

// Gold labels: the fixture's top category, except where the analyst disagrees with the model (so accuracy is 16/20 and 14/16).
const GOLD_FIX: Record<string, string> = { a02: "pencatatan_dokumen", a14: "pencatatan_dokumen", a18: "pembuatan", a19: "pembayaran", n05: "dokumen_kurang", n11: "dokumen_kurang" };
const LABEL_B_FIX: Record<string, string> = { a02: "pembuatan", a06: "perubahan" };
const gold = (task: GoldItem["task"], itemRef: string, label: string, labelB?: string): GoldItem => ({
  id: `g-${task}-${itemRef.replace(":", "-")}`, projectId: "p-p2p", task, itemRef, label, labeler: "u-dimas",
  ...(labelB ? { labelB, labelerB: "u-anton" } : {}), createdAt: MOCK_TODAY + "T09:00:00Z",
});
const goldItems: GoldItem[] = [
  ...([["f-bottleneck:c1", "relevan"], ["f-bottleneck:c2", "sebagian_relevan"], ["f-bottleneck:c3", "sebagian_relevan"], ["f-bottleneck:c4", "tidak_relevan"],
    ["f-bottleneck:c5", "informasi_tidak_cukup"], ["f-rework:c7", "relevan"]] as const).map(([ref, label]) => gold("relevansi", ref, label)),
  ...classItems.map((i) => {
    const label = GOLD_FIX[i.id] ?? CLASS_FIXTURE[i.id].top;
    const n = Number(i.id.slice(1));
    return gold(i.task, i.id, label, i.task === "aktivitas" && n <= 12 ? (LABEL_B_FIX[i.id] ?? label) : undefined);
  }),
];

export const initialState: MockState = { clients, projects, users, memberships, audit, sources, snapshots, mappings, rules,
  runs, monitoringConfigs: [p2pConfig], repairRules: [], datasetVersions: [], savedViews: [],
  findings: FINDINGS, interpretations, investigations, links, notes, comments, notifications, reviews: [], decisions, flags: [], proposals: [], analysisStates,
  assessFindings: findings, candidates, assessments, corrections: [], specs, classItems, classResults, classCorrections: [], goldItems, evaluations: [],
  ...graphSeed, viewerId: "u-dimas" };
