export type Role = "administrator" | "analis" | "pemilik_proses";
export type ProjectStatus = "draft" | "aktif" | "ditangguhkan" | "berakhir" | "diarsipkan";
export type AuditResult = "sukses" | "ditolak" | "gagal";

export interface Client {
  id: string;
  name: string;
  sector: string;
  contact: string;
}

export interface StatusChange {
  from: ProjectStatus;
  to: ProjectStatus;
  reason: string;
  at: string;
  by: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string;
  process: { name: string; startActivity: string; endActivity: string };
  contractStart: string;
  contractEnd: string | null;
  retention: string;
  status: ProjectStatus;
  statusHistory: StatusChange[];
  lastActivityAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  persona: "rina" | "dimas" | "sari" | null;
  pending: boolean;
}

export interface Membership {
  userId: string;
  projectId: string;
  role: Role;
  addedAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  objectType: string;
  objectLabel: string;
  projectId: string | null;
  result: AuditResult;
}

export type SnapshotStatus = "menunggu_unggah" | "memvalidasi" | "siap_dipetakan" | "perlu_tinjauan" | "gagal" | "dibatalkan";

export interface Source {
  id: string;
  projectId: string;
  name: string;
  kind: "file";
  createdAt: string;
  createdBy: string;
}

export interface Snapshot {
  id: string;
  sourceId: string;
  projectId: string;
  fileName: string;
  sizeBytes: number;
  format: "csv" | "xes" | "xes.gz" | "zip";
  checksum: string; // 12 hex tiruan dari nama+ukuran
  uploadedBy: string;
  uploadedAt: string;
  status: SnapshotStatus;
  failureReason?: string;
  stats?: {
    rows: number;
    rejected: number;
    encoding: string;
    delimiter: string;
    timeFrom: string;
    timeTo: string;
    latestEventAt: string;
    newEvents: number;
    duplicateEvents: number;
    conflictEvents: number;
  };
  columns?: { name: string; samples: string[] }[];
  preview?: string[][]; // maks 100 baris
  errors?: { kind: string; count: number; examples: { row: number; text: string }[] }[];
}

export type ColumnRole =
  | "case_id" | "activity" | "timestamp_end" | "timestamp_start" | "resource"
  | "event_id" | "lifecycle" | "case_attr" | "event_attr" | "ignore";

export interface LabelRule { raw: string; canonical: string | null } // null = dikecualikan

export interface MappingVersion {
  id: string; sourceId: string; snapshotId: string; projectId: string;
  version: number; // 1, 2, ... per sumber
  roles: Record<string, ColumnRole>; // kunci = nama kolom
  timeFormat: string;
  timezone: string; // IANA
  labels: LabelRule[];
  note?: string;
  createdBy: string; createdAt: string;
}

export type RuleType = "sla" | "urutan" | "wajib" | "terlarang" | "pemisahan_tugas";
export type RuleStatus = "draf" | "ditinjau" | "disetujui" | "usang";

export type RuleParams =
  | { type: "sla"; from: string; to: string; limit: number; unit: "kalender" | "kerja" }
  | { type: "urutan"; before: string; after: string }
  | { type: "wajib"; activity: string }
  | { type: "terlarang"; activity: string }
  | { type: "pemisahan_tugas"; activityA: string; activityB: string };

export interface RuleScope { attribute: string; op: "=" | "!=" | ">" | "<"; value: string }
export interface RuleSourceRef { docTitle: string; section: string; quote: string }

export interface RuleVersion {
  id: string; ruleKey: string; projectId: string; version: number; // 1, 2, ... per ruleKey
  name: string; description: string;
  params: RuleParams;
  scope: RuleScope | null;
  effectiveFrom: string; effectiveTo: string | null; // YYYY-MM-DD
  source: RuleSourceRef;
  status: RuleStatus;
  clientConfirmed: boolean;
  createdBy: string; createdAt: string;
  approvedBy?: string; approvedAt?: string;
}

export interface MockState {
  clients: Client[];
  projects: Project[];
  users: User[];
  memberships: Membership[];
  audit: AuditEvent[];
  sources: Source[];
  snapshots: Snapshot[];
  mappings: MappingVersion[];
  rules: RuleVersion[];
  findings: MockFinding[];
  interpretations: Interpretation[];
  investigations: Investigation[];
  links: InvestigationLink[];
  notes: InvestigationNote[];
  comments: Comment[];
  notifications: Notification[];
  reviews: ModelReview[];
  decisions: Decision[];
  flags: RevalidationFlag[];
  proposals: ContextProposal[];
  analysisStates: AnalysisState[];
  viewerId: string;
}

export type Audience = "analis" | "pemilik_proses";
export type ClaimType = "fakta_terukur" | "interpretasi" | "hipotesis" | "rekomendasi_tervalidasi";
export type SectionKey = "ringkasan" | "terukur" | "dasar_bukti" | "interpretasi"
  | "hipotesis_terbuka" | "asumsi" | "ketidakpastian" | "pertanyaan";
export type InterpretationStatus = "lolos_pemeriksaan" | "gagal_pemeriksaan";
export type CheckKey = "skema" | "placeholder" | "angka_literal" | "rujukan"
  | "tipe_klaim" | "tindakan_tidak_dikenal" | "bahasa_keputusan" | "ketidakpastian";

export type EvidenceKind = "temuan" | "metrik" | "aturan" | "kasus" | "hasil_jev" | "kandidat";
export interface EvidenceItem {
  id: string; // mis. "finding_42", "rule_sla_1"
  kind: EvidenceKind;
  title: string;
  detail: string; // teks; kutipan sumber untuk aturan
  measured: boolean; // hasil terukur (M05/M06) atau aturan/dokumen (M04)
  validated?: boolean; // hanya kind "kandidat": status tervalidasi M09
  metrics?: Record<string, { value: number; unit: string; version: string }>;
}
export type TargetKind = "temuan" | "penilaian_kandidat" | "perbandingan" | "skenario" | "uji_coba";
export interface MockFinding {
  id: string; projectId: string; kind: TargetKind; title: string; summary: string;
  limitedContext: boolean; // paket bukti "konteks terbatas" (M07)
  evidence: EvidenceItem[]; // paket bukti beku
}

export interface Claim { id: string; type: ClaimType; text: string; citations: string[]; candidateId?: string }
export interface Section { key: SectionKey; claims: Claim[] }
export interface Violation { check: CheckKey; claimId?: string; message: string }
export interface CheckResult { check: CheckKey; ok: boolean; messages: string[] }
export interface Attempt { n: number; sections: Section[]; violations: Violation[]; checks: CheckResult[] }
export interface CheckOverride { check: CheckKey; claimId?: string; reason: string; by: string; at: string }

export interface Interpretation {
  id: string; projectId: string; findingId: string; audience: Audience;
  status: InterpretationStatus;
  attempts: Attempt[]; // 1–3; percobaan terakhir menentukan status
  overrides: CheckOverride[];
  templateVersion: "tiruan-1"; model: "model-tiruan";
  createdBy: string; createdAt: string;
}

// M11 Investigasi
export type InvestigationStatus = "terbuka" | "menunggu_informasi" | "siap_diputuskan" | "selesai";
export type LinkKind = "temuan" | "kasus" | "aturan" | "kandidat" | "hasil_jev" | "interpretasi" | "skenario" | "uji_coba";
export type NoteKind = "wawancara" | "bukti" | "hipotesis" | "pertanyaan";
export type HypothesisState = "belum_diuji" | "didukung" | "dibantah";
export type DecisionStatus = "perlu_investigasi" | "usulan_uji_coba" | "dipilih" | "ditolak" | "digantikan";
export type RejectReason = "klaim_tidak_didukung" | "bahasa_tidak_sesuai" | "informasi_kurang";

export interface Investigation {
  id: string; projectId: string; title: string; question: string;
  originFindingId: string | null;
  status: InvestigationStatus;
  ownerId: string; memberIds: string[];
  createdAt: string;
}
export interface InvestigationLink {
  id: string; investigationId: string; kind: LinkKind; targetId: string;
  linkedVersion: string; // versi objek saat ditautkan, mis. "v2" atau "analisis-3"
  createdBy: string; createdAt: string;
}
export interface InvestigationNote {
  id: string; investigationId: string; kind: NoteKind; title: string; body: string;
  interviewee?: string; intervieweeRole?: string; interviewDate?: string; initialsOnly?: boolean;
  attachment?: { type: "file" | "link"; label: string; sizeBytes?: number };
  hypothesisState?: HypothesisState; findingId?: string; supportingLinkIds?: string[];
  assigneeId?: string; questionState?: "terbuka" | "terjawab";
  createdBy: string; createdAt: string;
}
export interface Comment {
  id: string; investigationId: string; targetLinkId: string | null; // null = pada workspace
  parentId: string | null; body: string; mentions: string[]; // userId
  resolved: boolean; createdBy: string; createdAt: string;
}
export interface Notification { id: string; userId: string; projectId: string; text: string; href: string; read: boolean; at: string }
export interface ModelReview {
  id: string; investigationId: string; linkId: string; // tautan hasil_jev atau interpretasi
  outcome: "dikonfirmasi" | "dikoreksi" | "disetujui" | "ditolak";
  correctedVerdict?: string; reason: string;
  rejectCode?: RejectReason; forEvalSet: boolean;
  by: string; at: string;
}
export interface EvidenceSnapshot {
  datasetVersion: string; contextPackage: string; analysis: string; evidencePackage: string;
  narrativeVersion: string | null; metricValues: Record<string, number>; ruleVersions: Record<string, string>;
}
export interface Decision {
  id: string; investigationId: string; projectId: string;
  targetLinkId: string; // tautan kandidat
  version: number; // 1, 2, ... per (investigationId, targetLinkId)
  status: DecisionStatus;
  replacedByLinkId?: string; // wajib bila digantikan
  reason: string; byId: string; byRole: Role; at: string;
  snapshot: EvidenceSnapshot;
}
export interface RevalidationFlag { id: string; decisionId: string; summary: string[]; at: string; clearedBy?: string; clearedAt?: string }
export interface ContextProposal { id: string; investigationId: string; ruleId: string; note: string; by: string; at: string }
export interface AnalysisState {
  projectId: string; datasetVersion: string; contextPackage: string; analysis: string; evidencePackage: string;
  metricValues: Record<string, number>; ruleVersions: Record<string, string>;
}
