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

export type DocKind = "sop" | "bpmn" | "sla" | "wawancara";

export interface ContextDoc {
  id: string; docKey: string; projectId: string; version: number; // 1, 2, ... per docKey
  title: string; kind: DocKind; issuer: string; docDate: string; effectiveFrom: string | null;
  fileName: string | null; sizeBytes: number; text?: string; // wawancara: text written in the app, no file
  status: "aktif" | "ditarik"; withdrawnReason?: string;
  uploadedBy: string; uploadedAt: string;
}

export type ConfigKind = "boundary" | "rework" | "population" | "calendar" | "bpmn" | "hypothesis" | "intervention" | "rubric";

// "Syarat penerapan": a condition code can evaluate on M03 capabilities, M06 metrics or case attributes.
export interface Condition { kind: "capability" | "metric" | "case_attr"; subject: string; op: "ada" | ">" | "<" | "=" | "!="; value: string }

export type ConfigData =
  | { kind: "boundary"; starts: string[]; ends: string[]; idleDays: number | null }
  | { kind: "rework"; repeated: boolean; returns: { from: string; to: string }[] }
  | { kind: "population"; completedOnly: boolean; periodFrom: string | null; periodTo: string | null; filter: RuleScope | null }
  | { kind: "calendar"; timezone: string; workDays: number[]; startTime: string; endTime: string; holidays: { date: string; name: string }[] } // workDays: 1 = Senin .. 7 = Minggu
  | { kind: "bpmn"; fileName: string; xml: string; mappings: { task: string; labels: string[] }[] } // task = BPMN element id
  | { kind: "hypothesis"; statement: string; symptom: string; evidence: string; conditions: Condition[] }
  | { kind: "intervention"; action: string; hypotheses: string[]; prerequisites: string; effort: string | null; risk: string | null; metric: string; conditions: Condition[] }
  | { kind: "rubric"; criteria: { name: string; weight: number; scale: { value: number; definition: string }[] }[] }; // "informasi tidak cukup" is always implied

export interface ConfigVersion {
  id: string; key: string; projectId: string; version: number; // 1, 2, ... per key
  name: string; data: ConfigData;
  status: RuleStatus; clientConfirmed: boolean;
  needsValidation: boolean; // starter catalog entries stay "perlu validasi Javan" until an analyst saves them
  createdBy: string; createdAt: string; approvedBy?: string; approvedAt?: string;
}

export interface PackageRef { kind: "aturan" | ConfigKind; id: string; key: string; version: number; name: string }
export interface ContextPackage {
  id: string; projectId: string; version: number; hash: string; refs: PackageRef[]; note: string;
  createdBy: string; createdAt: string;
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
  docs: ContextDoc[];
  configs: ConfigVersion[];
  packages: ContextPackage[];
  viewerId: string;
}
