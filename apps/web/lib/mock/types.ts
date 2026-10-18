import type { FilterSpec } from "./analysis";

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
export type RelationCategory = "asal_usul" | "observasi" | "dukungan_hipotesis" | "keputusan";
export type RelationCreator = "sistem" | "model" | "pengguna";
export type GraphNodeKind =
  | "Source" | "Snapshot" | "MappingVersion" | "Rule" | "Document"
  | "Activity" | "Transition" | "Analysis" | "MetricDefinition" | "Finding"
  | "Hypothesis" | "Intervention" | "Assessment" | "EvidenceBundle" | "Decision";

export interface GraphNode {
  id: string; projectId: string; kind: GraphNodeKind;
  label: string; sublabel?: string;
  href: string | null; // halaman asal; null = placeholder modul belum ada
  module: "M02" | "M03" | "M04" | "M05" | "M06" | "M07" | "M08" | "M11";
  supersededBy?: string; // id simpul versi lebih baru
}
export interface GraphEdge {
  id: string; projectId: string; from: string; to: string;
  type: string; // DERIVED_FROM, OBSERVED_AT, MAY_EXPLAIN, ...
  category: RelationCategory; createdBy: RelationCreator;
  status: "aktif" | "digantikan"; recordId: string; at: string;
}

export interface TraceFinding { id: string; projectId: string; title: string; metric: string; value: string; analysisId: string; at: string }

export interface BundleItem { nodeId: string; version: number | null; kind: GraphNodeKind; summary: string; tokens: number }
export interface EvidenceBundle {
  id: string; projectId: string; hash: string;
  target: string; // id simpul
  purpose: "jev_assessment" | "llm_interpretation";
  requestedBy: string; at: string;
  budget: { items: number; tokens: number };
  items: BundleItem[];
  excluded: { nodeId: string; reason: "dikecualikan karena anggaran" | "di luar hak akses"; kind: GraphNodeKind }[];
  limitedContext: boolean; // PRD: "konteks terbatas"
  assessmentId: string;
}

export interface GraphStatus { version: number; projectedAt: string; authoritativeAt: string; failed: { eventId: string; reason: string; attempts: number }[]; rebuilding: boolean }

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

export type ValidationStatus = "tervalidasi" | "belum_layak_dinilai" | "tidak_memenuhi_syarat" | "perlu_review";
export type RecCheckResult = "lolos" | "gagal" | "tidak_dapat_diperiksa";
export type RecCheckKey = "syarat" | "angka" | "versi" | "kewenangan" | "jev";
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
  runs: MonitoringRun[];
  monitoringConfigs: MonitoringConfig[];
  repairRules: RepairRule[];
  datasetVersions: DatasetVersion[];
  savedViews: SavedView[];
  traceFindings: TraceFinding[];
  bundles: EvidenceBundle[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphStatus: Record<string, GraphStatus>;
  assessFindings: Finding[];
  candidates: Candidate[];
  assessments: Assessment[];
  corrections: AssessmentCorrection[];
  specs: QuestionSpec[];
  classItems: ClassItem[];
  classResults: ClassResult[];
  classCorrections: ClassCorrection[];
  goldItems: GoldItem[];
  evaluations: EvaluationRun[];
  recFindings: RecFinding[];
  recCandidates: RecCandidate[];
  priorityPolicies: PriorityPolicy[];
  scenarios: Scenario[];
  trials: TrialProposal[];
  docs: ContextDoc[];
  configs: ConfigVersion[];
  packages: ContextPackage[];
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

export interface SavedView {
  id: string; projectId: string; name: string; note?: string;
  filter: FilterSpec; mode: "frekuensi" | "performa";
  selection: { kind: "node" | "edge" | "variant"; id: string } | null;
  activityPct: number; transitionPct: number;
  sourceId: string; snapshotId: string; mappingVersion: number; // data the view was saved against
  createdBy: string; createdAt: string;
}
