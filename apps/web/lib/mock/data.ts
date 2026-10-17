import { FINDINGS } from "./findings";
import { runCheckedGeneration, statusOf } from "./interpretation";
import type { Audience, AuditEvent, Client, Interpretation, Membership, MappingVersion, MockState, Project, RuleSourceRef, RuleVersion, Snapshot, Source, User } from "./types";

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

const snapshots: Snapshot[] = [
  { id: "sn-1", sourceId: "s-p2p-sap", projectId: "p-p2p", fileName: "sap_p2p_okt2026.csv", sizeBytes: 12_582_912, format: "csv", checksum: "9f3a1c7e0b42",
    uploadedBy: "u-dimas", uploadedAt: "2026-10-15T07:30:00Z", status: "siap_dipetakan",
    stats: { rows: 57_195, rejected: 312, encoding: "UTF-8", delimiter: ",", timeFrom: "2026-01-02", timeTo: "2026-10-14", latestEventAt: "2026-10-14",
      newEvents: 57_195, duplicateEvents: 0, conflictEvents: 0 },
    columns: COLUMNS, preview: PREVIEW },
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
    roles: { case_id: "case_id", activity: "activity", timestamp: "timestamp_end", resource: "resource" },
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
    description: "Batas awal sebelum direvisi.", createdAt: "2026-09-01T03:00:00Z",
    params: { type: "sla", from: "Create Purchase Order Item", to: "Record Goods Receipt", limit: 14, unit: "kalender" },
    source: sop("Bagian 4.2", "Barang harus diterima paling lambat 14 hari sejak PO dibuat.") }),
  rule({ id: "r-sla-2", ruleKey: "r-sla", version: 2, name: "Create Purchase Order Item ke Record Goods Receipt ≤ 14 hari kerja", status: "disetujui",
    description: "Satuan diperjelas menjadi hari kerja.", createdAt: "2026-09-10T03:00:00Z", approvedBy: "u-dimas", approvedAt: "2026-09-12T03:00:00Z", clientConfirmed: true,
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
];

export const initialState: MockState = { clients, projects, users, memberships, audit, sources, snapshots, mappings, rules, findings: FINDINGS, interpretations, viewerId: "u-dimas" };
