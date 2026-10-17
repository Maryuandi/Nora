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

export type ValidationStatus = "tervalidasi" | "belum_layak_dinilai" | "tidak_memenuhi_syarat" | "perlu_review";
export type CheckResult = "lolos" | "gagal" | "tidak_dapat_diperiksa";
export type CheckKey = "syarat" | "angka" | "versi" | "kewenangan" | "jev";
export type JevStatus = "otomatis" | "dikonfirmasi" | "perlu_review" | "informasi_tidak_cukup" | "belum_dinilai";

export interface RecMetric { key: string; label: string; value: number; unit: string } // angka M06 pada temuan
export interface RecFinding {
  id: string; projectId: string; title: string; summary: string;
  metrics: RecMetric[];
  affectedShare: number; waitShare: number; // 0-1, dari M06
  supportCases: number;
  activeRefs: Record<string, number>; // rujukan -> versi aktif di paket konteks
}
export interface JevResult {
  status: JevStatus; score: number | null; // 0-100
  criteria: { label: string; level: number }[]; prob: number | null;
  conclusion: "relevan" | "sebagian_relevan" | "tidak_relevan" | null;
}
export interface RecCandidate {
  id: string; kind: "hipotesis" | "intervensi"; origin: "katalog" | "analis"; proposeToCatalog: boolean;
  name: string; description: string; addresses: string; successMetric: string;
  findingIds: string[];
  conditions: { label: string; metricKey: string; op: ">" | ">=" | "<" | "<="; value: number }[];
  refMetrics: { metricKey: string; expected: number }[];
  refs: { key: string; version: number }[];
  ownerRole: Role | null;
  effort: number | null; risk: number | null; // 1-5, null = asumsi belum tersedia
  prerequisites: string[]; exclusions: string[];
  jev: Record<string, JevResult>; // per findingId
}
export interface PriorityWeights { relevance: number; magnitude: number; certainty: number; effort: number; risk: number }
export interface PriorityPolicy { projectId: string; version: number; weights: PriorityWeights; changedBy: string; changedAt: string; note: string }

export type ScenarioSpec =
  | { kind: "kurangi_jeda"; transition: string; pct: number }
  | { kind: "batasi_jeda"; transition: string; maxDays: number }
  | { kind: "hapus_rework"; activity: string; pct: number }
  | { kind: "lewati_aktivitas"; activity: string; filter: { attribute: "unit" | "kategori"; value: string } | null };
export interface ScenarioResult {
  n: number; affected: number;
  before: { median: number; p90: number }; after: { median: number; p90: number };
  smallSample: boolean;
}
export interface Scenario {
  id: string; projectId: string; name: string; spec: ScenarioSpec; datasetVersion: string; contextPack: string;
  status: "estimasi"; result: ScenarioResult; createdBy: string; createdAt: string;
}
export interface TrialProposal {
  id: string; projectId: string; findingId: string; candidateId: string; status: "draf";
  action: string; scope: string; durationWeeks: number | null;
  successMetric: string; baseline: { label: string; value: number; unit: string }[];
  target: string; guardrails: string[]; owner: string; risks: string[]; stopConditions: string[];
  createdBy: string; createdAt: string; updatedAt: string;
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
  recFindings: RecFinding[];
  recCandidates: RecCandidate[];
  priorityPolicies: PriorityPolicy[];
  scenarios: Scenario[];
  trials: TrialProposal[];
  viewerId: string;
}
