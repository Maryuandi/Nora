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

export type AssessmentStatus = "otomatis" | "perlu_review" | "informasi_tidak_cukup" | "gagal" | "tertunda";
export type Relevance = "relevan" | "sebagian_relevan" | "tidak_relevan" | "informasi_tidak_cukup";

export interface Criterion {
  key: string; label: string;
  weight: number; // bobot, jumlah 1 per kandidat
  scale: { level: number; definition: string }[]; // 1..5
}
export interface Candidate {
  id: string; kind: "hipotesis" | "intervensi"; name: string;
  criteria: Criterion[]; applicable: boolean; notApplicableReason?: string;
}
export interface Finding {
  id: string; projectId: string; title: string; summary: string;
  candidateIds: string[]; evidenceBundleId: string;
}

export interface CriterionScore { key: string; level: number; probs: number[] } // probs: panjang 5, jumlah 1
export interface Assessment {
  id: string; projectId: string; findingId: string; candidateId: string;
  status: AssessmentStatus;
  sufficient: { prob: number }; // Noul: probabilitas "cukup"
  scores: CriterionScore[]; // Score per kriteria
  relevance: { probs: Record<Relevance, number> }; // Choice: distribusi
  modelId: string; specVersion: number; evidenceBundleId: string; runId: string; createdAt: string;
  rawOutputRef: string; // tautan tiruan ke keluaran mentah
  supersededBy?: string; // id hasil yang menggantikannya
}
export interface AssessmentCorrection {
  id: string; assessmentId: string; actorId: string; at: string;
  relevance: Relevance; reason: string; addToGoldSet: boolean;
  confirmedOnly: boolean; // konfirmasi tanpa mengubah nilai
}

export type TaskKind = "relevansi" | "aktivitas" | "catatan";
export type ClassStatus = "otomatis" | "perlu_review" | "gagal";
export interface SpecCategory { key: string; label: string; definition: string }
export interface Thresholds { sufficient: number; topProb: number; margin: number }
export interface QuestionSpec { id: string; projectId: string; task: TaskKind; version: number; question: string; categories: SpecCategory[]; thresholds: Thresholds; note?: string; createdBy: string; createdAt: string }
export interface ClassItem { id: string; projectId: string; task: "aktivitas" | "catatan"; text: string; context: string; synthetic: boolean; activity?: string; period?: string }
export interface ClassResult { id: string; projectId: string; itemId: string; task: "aktivitas" | "catatan"; specVersion: number; modelId: string; runId: string; at: string; probs: Record<string, number>; status: ClassStatus; supersededBy?: string }
export interface ClassCorrection { id: string; resultId: string; actorId: string; at: string; category: string; reason: string; confirmedOnly: boolean }
export interface GoldItem { id: string; projectId: string; task: TaskKind; itemRef: string; label: string; labeler: string; labelB?: string; labelerB?: string; createdAt: string }
export interface Bin { lo: number; hi: number; n: number; meanConf: number; accuracy: number | null }
export interface EvaluationRun {
  id: string; projectId: string; task: TaskKind; at: string; actorId: string; modelId: string; specVersion: number; n: number; excluded: number;
  accuracy: number; macroF1: number; autoCoverage: number; autoAccuracy: number | null; reviewShare: number;
  highConf: { n: number; accuracy: number | null }; kappa: number | null; bins: Bin[];
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
  findings: Finding[];
  candidates: Candidate[];
  assessments: Assessment[];
  corrections: AssessmentCorrection[];
  specs: QuestionSpec[];
  classItems: ClassItem[];
  classResults: ClassResult[];
  classCorrections: ClassCorrection[];
  goldItems: GoldItem[];
  evaluations: EvaluationRun[];
  viewerId: string;
}
