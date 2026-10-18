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

export type CaseStatus = "patuh" | "tidak_patuh" | "tidak_dapat_dievaluasi";

export interface BpmnModel { name: string; activities: string[] } // model sekuensial tiruan
export interface MonitoringConfig {
  projectId: string; version: number;
  bottleneckTopN: number;
  bottleneckP90Days: number;
  reworkActivities: string[] | null; // null = definisi rework belum ditetapkan
  reworkHighPct: number;
  complianceHighPct: number;
  fitnessMin: number; // 0–1
  backlogAgeDays: number;
  ageBuckets: number[]; // naik ketat
  changePct: number;
  minCasesChange: number;
  minGroupCases: number;
  smallSampleCases: number;
  bpmnModel: BpmnModel | null;
  updatedBy: string | null; updatedAt: string | null;
}

export interface MonitoringRun {
  id: string; projectId: string;
  sourceId: string; snapshotId: string; mappingId: string;
  periodFrom: string; periodTo: string; // YYYY-MM-DD, inklusif
  ruleVersionIds: string[]; // dibekukan saat run
  ruleVersions: RuleVersion[]; // salinan beku versi aturan saat run (hasil tidak berubah bila aturan diedit)
  calendar: "bawaan_tiruan"; // Senin–Jumat, tanpa libur
  config: MonitoringConfig; // salinan beku pengaturan saat run
  createdBy: string; createdAt: string;
}

export interface MockCase { id: string; start: string; end: string | null } // end null = masih terbuka
export interface CaseResult { caseId: string; start: string; status: CaseStatus; reason?: string; atRisk?: boolean; ruleVersionId: string | null }

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
  runs: MonitoringRun[];
  monitoringConfigs: MonitoringConfig[];
  repairRules: RepairRule[];
  datasetVersions: DatasetVersion[];
  viewerId: string;
}

export type CheckId =
  | "nilai_hilang" | "waktu_tidak_wajar" | "duplikasi" | "urutan_ambigu"
  | "kasus_belum_selesai" | "waktu_mulai_selesai" | "label_belum_dipetakan" | "di_luar_periode";
export type Severity = "tinggi" | "sedang" | "info";
export type RepairAction = "kecualikan_event" | "kecualikan_kasus" | "terima";

export interface RepairRule {
  id: string; sourceId: string; projectId: string;
  check: CheckId; action: RepairAction; reason: string;
  impactEvents: number; impactCases: number; // computed at creation
  active: boolean; // false = revoked
  createdBy: string; createdAt: string; revokedBy?: string; revokedAt?: string;
}

export type CapabilityStatus = "tersedia" | "terbatas" | "tidak_tersedia";
export interface Capability { id: string; label: string; status: CapabilityStatus; explanation: string }

export interface DatasetVersion {
  id: string; sourceId: string; projectId: string; version: number; // per source
  snapshotId: string; mappingId: string; repairRuleIds: string[]; // active rules at publish
  hash: string; // 12 hex, deterministic
  verdict: "siap" | "siap_catatan" | "belum_layak";
  eventsIncluded: number; casesIncluded: number;
  capabilities: Capability[]; note?: string;
  createdBy: string; createdAt: string;
}
