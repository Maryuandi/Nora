import { MOCK_TODAY, initialState } from "./data";
import { isStale } from "../format";
import { participatingVersions } from "./compliance";
import { fabricate } from "./fabricate";
import { AUDIENCE_LABEL, CHECK_LABEL, isOverridable, runCheckedGeneration, statusOf, violationKey } from "./interpretation";
import { reduceInvestigation, type InvestigationAction } from "./investigation-reducer";
import { configFor, copyConfig } from "./metrics";
import { validateMapping } from "./mapping";
import { normalizeFilter, validateFilter, type FilterSpec } from "./analysis";
import { eventLogFor } from "./eventlog";
import { id, now, withAudit } from "./mutate";
import { acceptsData, can } from "./permissions";
import { nextStatuses, previewDataset, previewRule, projectCanonicalLabels, ruleVersions, validateRule, type RuleInput } from "./rules";
import { ACTION_LABEL, CHECK_META, buildCapabilities, buildQualityReport, datasetHash, excludedAfter, qualityDataset, repairImpact } from "./quality";
import { projectSchema, type ProjectInput } from "./schemas";
import type { Audience, AuditEvent, CheckId, CheckKey, ColumnRole, DatasetVersion, Interpretation, Investigation, LabelRule, MappingVersion, MockFinding, MockState, MonitoringConfig, MonitoringRun, Notification, Project, ProjectStatus, RepairAction, RepairRule, RevalidationFlag, Role, RuleStatus, RuleVersion, SavedView, Snapshot, SnapshotStatus, Source } from "./types";

export { MOCK_TODAY, initialState };
export { ruleVersions } from "./rules"; // dipindah ke rules.ts agar investigation-reducer tak mengimpor nilai dari sini

export type MockAction =
  | { type: "createClient"; input: { name: string; sector: string; contact: string } }
  | { type: "createProject"; input: ProjectInput }
  | { type: "changeProjectStatus"; projectId: string; to: ProjectStatus; reason: string }
  | { type: "addMember"; projectId: string; email: string; role: Role }
  | { type: "changeMemberRole"; projectId: string; userId: string; role: Role }
  | { type: "removeMember"; projectId: string; userId: string }
  | { type: "createSource"; projectId: string; name: string }
  | { type: "uploadSnapshot"; sourceId: string; fileName: string; sizeBytes: number }
  | { type: "confirmSnapshot"; snapshotId: string }
  | { type: "cancelSnapshot"; snapshotId: string }
  | { type: "saveMapping"; sourceId: string; snapshotId: string; roles: Record<string, ColumnRole>; timeFormat: string; timezone: string;
      labels: LabelRule[]; confirmed: ColumnRole[]; timezoneConfirmed: boolean; note?: string }
  | { type: "saveRule"; projectId: string; ruleKey?: string; input: RuleInput }
  | { type: "changeRuleStatus"; ruleId: string; to: RuleStatus }
  | { type: "confirmRuleClient"; ruleId: string }
  | { type: "requestInterpretation"; projectId: string; findingId: string; audience: Audience }
  | { type: "overrideCheck"; interpretationId: string; check: CheckKey; claimId?: string; reason: string }
  | { type: "runMonitoring"; projectId: string; sourceId: string; periodFrom: string; periodTo: string }
  | { type: "updateMonitoringConfig"; projectId: string; patch: Partial<Omit<MonitoringConfig, "projectId" | "version" | "updatedBy" | "updatedAt">> }
  | { type: "addRepairRule"; sourceId: string; check: CheckId; action: RepairAction; reason: string; confirmLarge?: boolean }
  | { type: "revokeRepairRule"; ruleId: string }
  | { type: "publishDataset"; sourceId: string; note?: string }
  | { type: "saveView"; projectId: string; name: string; note?: string; filter: FilterSpec; mode: SavedView["mode"]; selection: SavedView["selection"]; activityPct: number; transitionPct: number }
  | { type: "setViewer"; userId: string }
  | InvestigationAction;

export type ReduceResult = {
  state: MockState; error?: string; snapshotId?: string; duplicateOf?: string; mappingId?: string; datasetId?: string; repairRuleId?: string; ruleId?: string; runId?: string; savedViewId?: string;
  interpretationId?: string; investigationId?: string; linkId?: string; noteId?: string; commentId?: string; decisionId?: string; proposalId?: string;
};

const MAX_BYTES = 500 * 1024 * 1024;
// ".xes.gz" must come before ".xes".
const FORMATS = ["xes.gz", "csv", "xes", "zip"] as const;
const DAY = 86_400_000;

// 32-bit FNV-1a run twice with different seeds -> 12 hex chars. Fake checksum, not cryptographic.
function fnv(text: string): string {
  const h = (seed: number) => {
    let x = seed;
    for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619) >>> 0;
    return x.toString(16).padStart(8, "0");
  };
  return (h(2166136261) + h(0x9e3779b1)).slice(0, 12);
}

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ["aktif"],
  aktif: ["ditangguhkan", "berakhir"],
  ditangguhkan: ["aktif", "berakhir"],
  berakhir: ["diarsipkan"],
  diarsipkan: [],
};

export const allowedTransitions = (from: ProjectStatus) => TRANSITIONS[from];

const isLastAdmin = (s: MockState, projectId: string, userId: string) => {
  const admins = s.memberships.filter((m) => m.projectId === projectId && m.role === "administrator");
  return admins.length === 1 && admins[0].userId === userId;
};

export function reduce(state: MockState, action: MockAction): ReduceResult {
  const fail = (error: string) => ({ state, error });
  const m11 = reduceInvestigation(state, action, reduce);
  if (m11) return m11;
  switch (action.type) {
    case "setViewer":
      return { state: { ...state, viewerId: action.userId } };

    case "createClient": {
      const name = action.input.name.trim();
      if (state.clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail("Klien dengan nama ini sudah ada");
      const client = { id: id("c"), name, sector: action.input.sector.trim(), contact: action.input.contact.trim() };
      return { state: withAudit({ ...state, clients: [...state.clients, client] }, { action: "klien.buat", objectType: "Klien", objectLabel: name, projectId: null }) };
    }

    case "createProject": {
      const parsed = projectSchema.safeParse(action.input);
      if (!parsed.success) return fail(parsed.error.issues[0].message);
      const v = parsed.data;
      if (state.projects.some((p) => p.clientId === v.clientId && p.name.toLowerCase() === v.name.toLowerCase()))
        return fail("Nama proyek sudah dipakai di klien ini");
      const project: Project = {
        id: id("p"), clientId: v.clientId, name: v.name, description: v.description,
        process: { name: v.processName, startActivity: v.startActivity, endActivity: v.endActivity },
        contractStart: v.contractStart, contractEnd: v.contractEnd, retention: v.retention,
        status: "draft", statusHistory: [], lastActivityAt: now(),
      };
      const next = {
        ...state,
        projects: [...state.projects, project],
        memberships: [...state.memberships, { userId: state.viewerId, projectId: project.id, role: "administrator" as const, addedAt: now() }],
      };
      return { state: withAudit(next, { action: "proyek.buat", objectType: "Proyek", objectLabel: project.name, projectId: project.id }) };
    }

    case "changeProjectStatus": {
      const p = state.projects.find((x) => x.id === action.projectId);
      if (!p) return fail("Proyek tidak ditemukan");
      if (!action.reason.trim()) return fail("Alasan wajib diisi");
      if (!TRANSITIONS[p.status].includes(action.to)) return fail("Perubahan status ini tidak diizinkan");
      const updated: Project = {
        ...p, status: action.to, lastActivityAt: now(),
        statusHistory: [...p.statusHistory, { from: p.status, to: action.to, reason: action.reason.trim(), at: now(), by: state.viewerId }],
      };
      const next = { ...state, projects: state.projects.map((x) => (x.id === p.id ? updated : x)) };
      return { state: withAudit(next, { action: "proyek.status", objectType: "Proyek", objectLabel: `${p.name}: ${p.status} → ${action.to}`, projectId: p.id }) };
    }

    case "addMember": {
      const email = action.email.trim().toLowerCase();
      let users = state.users;
      let user = users.find((u) => u.email.toLowerCase() === email);
      if (!user) {
        user = { id: id("u"), name: email.split("@")[0], email, persona: null, pending: true };
        users = [...users, user];
      }
      const existing = state.memberships.find((m) => m.projectId === action.projectId && m.userId === user!.id);
      if (existing) {
        if (existing.role === action.role) return { state };
        return reduce({ ...state, users }, { type: "changeMemberRole", projectId: action.projectId, userId: user.id, role: action.role });
      }
      const next = { ...state, users, memberships: [...state.memberships, { userId: user.id, projectId: action.projectId, role: action.role, addedAt: now() }] };
      return { state: withAudit(next, { action: "anggota.tambah", objectType: "Anggota", objectLabel: user.email, projectId: action.projectId }) };
    }

    case "changeMemberRole": {
      const mem = state.memberships.find((m) => m.projectId === action.projectId && m.userId === action.userId);
      if (!mem) return fail("Anggota tidak ditemukan");
      if (mem.role === "administrator" && action.role !== "administrator" && isLastAdmin(state, action.projectId, action.userId))
        return fail("Administrator terakhir tidak bisa diturunkan");
      const next = { ...state, memberships: state.memberships.map((m) => (m === mem ? { ...m, role: action.role } : m)) };
      const label = state.users.find((u) => u.id === action.userId)?.email ?? action.userId;
      return { state: withAudit(next, { action: "anggota.ubah_peran", objectType: "Anggota", objectLabel: `${label}: ${mem.role} → ${action.role}`, projectId: action.projectId }) };
    }

    case "removeMember": {
      const mem = state.memberships.find((m) => m.projectId === action.projectId && m.userId === action.userId);
      if (!mem) return fail("Anggota tidak ditemukan");
      if (isLastAdmin(state, action.projectId, action.userId)) return fail("Administrator terakhir tidak bisa dicabut");
      const next = { ...state, memberships: state.memberships.filter((m) => m !== mem) };
      const label = state.users.find((u) => u.id === action.userId)?.email ?? action.userId;
      return { state: withAudit(next, { action: "anggota.cabut", objectType: "Anggota", objectLabel: label, projectId: action.projectId }) };
    }

    case "createSource": {
      const p = state.projects.find((x) => x.id === action.projectId);
      if (!p) return fail("Proyek tidak ditemukan");
      if (!acceptsData(p.status)) return fail("Proyek ini tidak menerima data baru");
      const name = action.name.trim();
      if (!name) return fail("Nama sumber wajib diisi");
      if (state.sources.some((x) => x.projectId === p.id && x.name.toLowerCase() === name.toLowerCase()))
        return fail("Sumber dengan nama ini sudah ada di proyek ini");
      const source = { id: id("s"), projectId: p.id, name, kind: "file" as const, createdAt: now(), createdBy: state.viewerId };
      return { state: withAudit({ ...state, sources: [...state.sources, source] }, { action: "sumber.tambah", objectType: "Sumber data", objectLabel: name, projectId: p.id }) };
    }

    case "uploadSnapshot": {
      const source = state.sources.find((x) => x.id === action.sourceId);
      const project = source && state.projects.find((x) => x.id === source.projectId);
      if (!source || !project) return fail("Sumber data tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const lower = action.fileName.toLowerCase();
      const format = FORMATS.find((f) => lower.endsWith(`.${f}`));
      if (!format) return fail("Format tidak didukung");
      if (!(action.sizeBytes > 0)) return fail("File kosong");
      if (action.sizeBytes > MAX_BYTES) return fail("Ukuran melebihi 500 MB");
      const checksum = fnv(`${action.fileName}:${action.sizeBytes}`);
      const mine = state.snapshots.filter((x) => x.sourceId === source.id && x.status !== "dibatalkan");
      const dup = mine.find((x) => x.checksum === checksum);
      if (dup) return { state, duplicateOf: dup.id };

      const snap: Snapshot = {
        id: id("sn"), sourceId: source.id, projectId: project.id, fileName: action.fileName, sizeBytes: action.sizeBytes,
        format, checksum, uploadedBy: state.viewerId, uploadedAt: now(), status: "siap_dipetakan",
      };
      if (lower.includes("gagal")) {
        snap.status = "gagal";
        snap.failureReason = "Isi file bukan CSV yang valid";
        snap.errors = [{ kind: "Struktur file tidak dikenali", count: 1, examples: [{ row: 1, text: "(berkas biner, bukan teks)" }] }];
      } else {
        const rows = Math.round(action.sizeBytes / 220);
        const damaged = lower.includes("rusak");
        const rejected = Math.round(rows * (damaged ? 0.08 : 0.005));
        const hasPrior = mine.some((x) => x.stats);
        const duplicateEvents = hasPrior ? Math.round(rows * 0.4) : 0;
        const conflictEvents = hasPrior ? Math.round(rows * 0.002) : 0;
        const latest = new Date(Date.parse(MOCK_TODAY) - DAY).toISOString().slice(0, 10);
        snap.status = damaged ? "perlu_tinjauan" : "siap_dipetakan";
        snap.stats = {
          rows, rejected, encoding: "UTF-8", delimiter: format === "csv" ? ";" : "-",
          timeFrom: new Date(Date.parse(latest) - 270 * DAY).toISOString().slice(0, 10), timeTo: latest, latestEventAt: latest,
          newEvents: rows - duplicateEvents - conflictEvents, duplicateEvents, conflictEvents,
        };
        Object.assign(snap, fabricate(rows, rejected));
      }
      const next = { ...state, snapshots: [...state.snapshots, snap] };
      return { state: withAudit(next, { action: "snapshot.unggah", objectType: "Snapshot", objectLabel: snap.fileName, projectId: project.id }), snapshotId: snap.id };
    }

    case "saveMapping": {
      const source = state.sources.find((x) => x.id === action.sourceId);
      const project = source && state.projects.find((x) => x.id === source.projectId);
      if (!source || !project) return fail("Sumber data tidak ditemukan");
      const snap = state.snapshots.find((x) => x.id === action.snapshotId);
      if (!snap) return fail("Snapshot tidak ditemukan");
      if (snap.sourceId !== source.id) return fail("Snapshot bukan milik sumber ini");
      if (snap.status !== "siap_dipetakan") return fail("Snapshot belum siap dipetakan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const invalid = validateMapping({ ...action, columns: (snap.columns ?? []).map((c) => c.name) })[0];
      if (invalid) return fail(invalid.message);
      const latest = latestMapping(state, source.id);
      if (latest && sameConfig(latest, action)) return fail(`Tidak ada perubahan dari v${latest.version}`);
      const version = Math.max(0, ...state.mappings.filter((m) => m.sourceId === source.id).map((m) => m.version)) + 1;
      const mapping: MappingVersion = {
        id: id("m"), sourceId: source.id, snapshotId: snap.id, projectId: project.id, version,
        roles: action.roles, timeFormat: action.timeFormat, timezone: action.timezone, labels: action.labels,
        ...(action.note?.trim() ? { note: action.note.trim() } : {}), createdBy: state.viewerId, createdAt: now(),
      };
      const next = { ...state, mappings: [...state.mappings, mapping] };
      return { state: withAudit(next, { action: "pemetaan.simpan", objectType: "Pemetaan", objectLabel: `${source.name} v${version}`, projectId: project.id }), mappingId: mapping.id };
    }

    case "saveRule": {
      const project = state.projects.find((x) => x.id === action.projectId);
      if (!project) return fail("Proyek tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const latest = action.ruleKey ? ruleVersions(state, action.ruleKey)[0] : undefined;
      if (action.ruleKey) {
        if (!latest) return fail("Aturan tidak ditemukan");
        if (latest.projectId !== project.id) return fail("Aturan bukan milik proyek ini");
        if (latest.status === "usang") return fail("Aturan usang tidak dapat diubah");
      }
      const invalid = validateRule(action.input, projectCanonicalLabels(state, project.id))[0];
      if (invalid) return fail(invalid.message);
      if (latest && sameRuleInput(latest, action.input)) return fail("Tidak ada perubahan");
      const { name, description, params, scope, effectiveFrom, effectiveTo, source } = action.input;
      const fields = { name: name.trim(), description, params, scope, effectiveFrom, effectiveTo, source };
      let written: RuleVersion;
      let rules: RuleVersion[];
      if (latest?.status === "draf") {
        written = { ...latest, ...fields, clientConfirmed: false }; // changed content needs a fresh client confirmation
        rules = state.rules.map((x) => (x === latest ? written : x));
      } else {
        written = {
          ...fields, id: id("r"), ruleKey: latest ? latest.ruleKey : id("rk"), projectId: project.id, version: (latest?.version ?? 0) + 1,
          status: "draf", clientConfirmed: false, createdBy: state.viewerId, createdAt: now(),
        };
        rules = [...state.rules, written];
      }
      return { state: withAudit({ ...state, rules }, { action: "aturan.simpan", objectType: "Aturan", objectLabel: `${written.name} v${written.version}`, projectId: project.id }), ruleId: written.id };
    }

    case "changeRuleStatus": {
      const rule = state.rules.find((x) => x.id === action.ruleId);
      if (!rule) return fail("Aturan tidak ditemukan");
      const project = state.projects.find((x) => x.id === rule.projectId);
      if (!project || !acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      if (!nextStatuses(rule.status).includes(action.to)) return fail("Transisi status tidak diizinkan");
      if (action.to === "ditinjau" || action.to === "disetujui") {
        const invalid = validateRule(rule, projectCanonicalLabels(state, project.id))[0];
        if (invalid) return fail(invalid.message);
      }
      let updated: RuleVersion = { ...rule, status: action.to, ...(action.to === "draf" ? { clientConfirmed: false } : {}) };
      if (action.to === "disetujui") {
        if (![rule.source.docTitle, rule.source.section, rule.source.quote].every((v) => typeof v === "string" && v.trim())) return fail("Aturan tanpa rujukan sumber tidak dapat disetujui");
        const preview = previewRule(rule, previewDataset(state, project.id));
        if (preview.status === "tidak_dapat_dievaluasi") return fail(`Aturan tidak dapat dievaluasi: ${preview.reason}`);
        updated = { ...updated, approvedBy: state.viewerId, approvedAt: now() };
      }
      const rules = state.rules.map((x) => {
        if (x === rule) return updated;
        // Only one disetujui version per ruleKey: approving a newer one retires the others.
        return action.to === "disetujui" && x.ruleKey === rule.ruleKey && x.status === "disetujui" ? { ...x, status: "usang" as const } : x;
      });
      const audit = action.to === "ditinjau" ? "aturan.ajukan" : action.to === "draf" ? "aturan.kembalikan" : action.to === "disetujui" ? "aturan.setujui" : "aturan.usangkan";
      return { state: withAudit({ ...state, rules }, { action: audit, objectType: "Aturan", objectLabel: `${rule.name} v${rule.version}`, projectId: project.id }), ruleId: rule.id };
    }

    case "runMonitoring": {
      const project = state.projects.find((x) => x.id === action.projectId);
      if (!project) return fail("Proyek tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const source = state.sources.find((x) => x.id === action.sourceId && x.projectId === project.id);
      if (!source) return fail("Sumber tidak ditemukan");
      const runnable = runnableSources(state, project.id).find((x) => x.source.id === source.id);
      if (!runnable) return fail("Sumber belum punya pemetaan dan snapshot siap");
      const { periodFrom, periodTo } = action;
      const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
      if (!validDate(periodFrom) || !validDate(periodTo) || periodFrom > periodTo) return fail("Periode tidak valid");
      const versions = participatingVersions(state, project.id);
      if (versions.length === 0) return fail("Belum ada aturan disetujui atau ditinjau");
      const run: MonitoringRun = {
        id: id("run"), projectId: project.id, sourceId: source.id, snapshotId: runnable.snapshot.id, mappingId: runnable.mapping.id,
        periodFrom, periodTo, ruleVersionIds: versions.map((v) => v.id), ruleVersions: versions.map((v) => ({ ...v })), calendar: "bawaan_tiruan", config: copyConfig(configFor(state, project.id)), createdBy: state.viewerId, createdAt: now(),
      };
      return { state: withAudit({ ...state, runs: [...state.runs, run] }, { action: "monitoring.jalankan", objectType: "Monitoring", objectLabel: `${source.name} ${periodFrom}–${periodTo}`, projectId: project.id }), runId: run.id };
    }

    case "updateMonitoringConfig": {
      const project = state.projects.find((x) => x.id === action.projectId);
      if (!project) return fail("Proyek tidak ditemukan");
      if (viewerRole(state, project.id) !== "analis") return fail("Hanya analis yang dapat mengubah ambang");
      const patch = action.patch;
      const isInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 1;
      const num = (v: unknown, ok: (n: number) => boolean) => typeof v === "number" && Number.isFinite(v) && ok(v);
      const present = <K extends keyof typeof patch>(...keys: K[]) => keys.filter((k) => patch[k] !== undefined);
      if (present("bottleneckTopN", "backlogAgeDays", "minCasesChange", "minGroupCases", "smallSampleCases").some((k) => !isInt(patch[k]))
        || (patch.bottleneckP90Days !== undefined && !num(patch.bottleneckP90Days, (n) => n > 0))) return fail("Nilai ambang harus bilangan positif");
      if (present("reworkHighPct", "complianceHighPct", "changePct").some((k) => !num(patch[k], (n) => n >= 0 && n <= 100))) return fail("Persentase harus 0–100");
      if (patch.fitnessMin !== undefined && !num(patch.fitnessMin, (n) => n >= 0 && n <= 1)) return fail("Fitness minimum harus 0–1");
      const b = patch.ageBuckets;
      if (b !== undefined && (b.length < 1 || b.length > 5 || !b.every(isInt) || b.some((v, i) => i > 0 && v <= b[i - 1]))) return fail("Kelompok umur harus naik dan positif");
      if (patch.reworkActivities !== undefined && patch.reworkActivities !== null && patch.reworkActivities.length === 0) return fail("Pilih minimal satu aktivitas rework");
      const config = copyConfig({ ...configFor(state, project.id), ...patch, version: configFor(state, project.id).version + 1, updatedBy: state.viewerId, updatedAt: now() });
      const monitoringConfigs = state.monitoringConfigs.some((c) => c.projectId === project.id)
        ? state.monitoringConfigs.map((c) => (c.projectId === project.id ? config : c)) : [...state.monitoringConfigs, config];
      return { state: withAudit({ ...state, monitoringConfigs }, { action: "monitoring.ambang.ubah", objectType: "Monitoring", objectLabel: `Ambang monitoring v${config.version}`, projectId: project.id }) };
    }

    case "confirmRuleClient": {
      const rule = state.rules.find((x) => x.id === action.ruleId);
      if (!rule) return fail("Aturan tidak ditemukan");
      const project = state.projects.find((x) => x.id === rule.projectId);
      if (!project || !acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      if (rule.status !== "ditinjau" && rule.status !== "disetujui") return fail("Hanya aturan yang ditinjau atau disetujui yang bisa dikonfirmasi klien");
      if (rule.clientConfirmed) return fail("Aturan ini sudah dikonfirmasi klien");
      const rules = state.rules.map((x) => (x === rule ? { ...x, clientConfirmed: true } : x));
      return { state: withAudit({ ...state, rules }, { action: "aturan.konfirmasi_klien", objectType: "Aturan", objectLabel: `${rule.name} v${rule.version}`, projectId: project.id }), ruleId: rule.id };
    }

    case "requestInterpretation": {
      const project = state.projects.find((x) => x.id === action.projectId);
      if (!project) return fail("Proyek tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const finding = state.findings.find((f) => f.id === action.findingId && f.projectId === project.id);
      if (!finding) return fail("Target tidak ditemukan");
      if (!Object.hasOwn(AUDIENCE_LABEL, action.audience)) return fail("Audiens tidak dikenal");
      const attempts = runCheckedGeneration(finding, action.audience);
      const draft: Interpretation = {
        id: id("i"), projectId: project.id, findingId: finding.id, audience: action.audience, status: statusOf(attempts, []), attempts, overrides: [],
        templateVersion: "tiruan-1", model: "model-tiruan", createdBy: state.viewerId, createdAt: now(),
      };
      return { state: withAudit({ ...state, interpretations: [...state.interpretations, draft] }, { action: "interpretation.minta", objectType: "Interpretation", objectLabel: `${finding.title} · ${AUDIENCE_LABEL[action.audience]}`, projectId: project.id }), interpretationId: draft.id };
    }

    case "overrideCheck": {
      const interp = state.interpretations.find((x) => x.id === action.interpretationId);
      if (!interp) return fail("Interpretasi tidak ditemukan");
      const project = state.projects.find((x) => x.id === interp.projectId);
      if (!project || !acceptsData(project.status)) return fail("Proyek ini tidak menerima data baru");
      const reason = typeof action.reason === "string" ? action.reason.trim() : "";
      if (!reason) return fail("Alasan wajib diisi");
      if (interp.status !== "gagal_pemeriksaan") return fail("Draf ini sudah lolos pemeriksaan");
      if (!isOverridable(action.check)) return fail("Pemeriksaan ini tidak dapat dikesampingkan");
      const key = violationKey(action);
      const last = interp.attempts[interp.attempts.length - 1];
      const open = last?.violations.some((v) => violationKey(v) === key) && !interp.overrides.some((o) => violationKey(o) === key);
      if (!open) return fail("Pelanggaran tidak ditemukan");
      const overrides = [...interp.overrides, { check: action.check, ...(action.claimId ? { claimId: action.claimId } : {}), reason, by: state.viewerId, at: now() }];
      const updated: Interpretation = { ...interp, overrides, status: statusOf(interp.attempts, overrides) };
      const finding = state.findings.find((f) => f.id === interp.findingId);
      const next = { ...state, interpretations: state.interpretations.map((x) => (x === interp ? updated : x)) };
      return { state: withAudit(next, { action: "interpretation.kesampingkan", objectType: "Interpretation", objectLabel: `${finding?.title ?? interp.findingId} · ${CHECK_LABEL[action.check]} — ${reason}`, projectId: project.id }), interpretationId: interp.id };
    }

    case "addRepairRule": {
      const source = state.sources.find((x) => x.id === action.sourceId);
      const project = source && state.projects.find((x) => x.id === source.projectId);
      if (!source || !project) return fail("Sumber tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima perubahan");
      const dataset = qualityDataset(state, source.id);
      if (!dataset) return fail("Belum ada data yang siap dinilai");
      const reason = action.reason.trim();
      if (!reason) return fail("Alasan wajib diisi");
      const active = repairRulesForSource(state, source.id, true);
      const report = buildQualityReport(dataset, active);
      const finding = report.findings.find((f) => f.id === action.check);
      const exclusion = action.action !== "terima";
      if (finding?.status === "tidak_diketahui") {
        if (exclusion) return fail("Aksi pengecualian tidak berlaku untuk temuan yang belum diketahui");
      } else if (finding?.status !== "ditemukan") return fail("Tidak ada masalah untuk ditangani");
      if (active.some((r) => r.check === action.check)) return fail("Sudah ada aturan perbaikan aktif untuk pemeriksaan ini");
      const impact = exclusion && finding?.status === "ditemukan" ? repairImpact(report, action.check) : { events: 0, cases: 0 };
      // excluded > 20% of totalEvents, written as an integer comparison so exactly 20% stays exact.
      if (exclusion && excludedAfter(report, active, { check: action.check, ...impact }).events * 5 > report.totalEvents && action.confirmLarge !== true)
        return fail("Aturan ini mengecualikan lebih dari 20% event; konfirmasi tambahan diperlukan");
      const rule: RepairRule = {
        id: id("rp"), sourceId: source.id, projectId: project.id, check: action.check, action: action.action, reason,
        impactEvents: impact.events, impactCases: impact.cases, active: true, createdBy: state.viewerId, createdAt: now(),
      };
      const next = { ...state, repairRules: [...state.repairRules, rule] };
      return { state: withAudit(next, { action: "perbaikan.tambah", objectType: "Perbaikan", objectLabel: `${CHECK_META[rule.check].title} (${ACTION_LABEL[rule.action]})`, projectId: project.id }), repairRuleId: rule.id };
    }

    case "revokeRepairRule": {
      const rule = state.repairRules.find((x) => x.id === action.ruleId);
      const project = rule && state.projects.find((x) => x.id === rule.projectId);
      if (!rule || !project) return fail("Aturan tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima perubahan");
      if (!rule.active) return fail("Aturan sudah dicabut");
      const revoked: RepairRule = { ...rule, active: false, revokedBy: state.viewerId, revokedAt: now() };
      const next = { ...state, repairRules: state.repairRules.map((x) => (x === rule ? revoked : x)) };
      return { state: withAudit(next, { action: "perbaikan.cabut", objectType: "Perbaikan", objectLabel: `${CHECK_META[rule.check].title} (${ACTION_LABEL[rule.action]})`, projectId: project.id }) };
    }

    case "publishDataset": {
      const source = state.sources.find((x) => x.id === action.sourceId);
      const project = source && state.projects.find((x) => x.id === source.projectId);
      if (!source || !project) return fail("Sumber tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima perubahan");
      const dataset = qualityDataset(state, source.id);
      if (!dataset) return fail("Belum ada data yang siap dinilai");
      const active = repairRulesForSource(state, source.id, true);
      const report = buildQualityReport(dataset, active);
      if (report.verdict === "belum_layak") return fail(`Data belum layak diterbitkan: ${report.reasons[0] ?? "periksa laporan kualitas"}`);
      const repairRuleIds = active.map((r) => r.id).sort();
      const hash = datasetHash(dataset.snapshot.id, dataset.mapping.id, repairRuleIds);
      const latest = latestDataset(state, source.id);
      if (latest && latest.hash === hash) return fail(`Tidak ada perubahan dari v${latest.version}`);
      const version = Math.max(0, ...state.datasetVersions.filter((d) => d.sourceId === source.id).map((d) => d.version)) + 1;
      const ds: DatasetVersion = {
        id: id("ds"), sourceId: source.id, projectId: project.id, version, snapshotId: dataset.snapshot.id, mappingId: dataset.mapping.id,
        repairRuleIds, hash, verdict: report.verdict, eventsIncluded: report.eventsIncluded, casesIncluded: report.casesIncluded,
        capabilities: buildCapabilities(dataset, report), ...(action.note?.trim() ? { note: action.note.trim() } : {}),
        createdBy: state.viewerId, createdAt: now(),
      };
      const next = { ...state, datasetVersions: [...state.datasetVersions, ds] };
      return { state: withAudit(next, { action: "dataset.terbit", objectType: "Dataset", objectLabel: `${source.name} v${version}`, projectId: project.id }), datasetId: ds.id };
    }

    case "saveView": {
      const project = state.projects.find((x) => x.id === action.projectId);
      if (!project) return fail("Proyek tidak ditemukan");
      if (!acceptsData(project.status)) return fail("Proyek ini tidak menerima perubahan");
      const current = eventLogFor(state, project.id);
      if (!current) return fail("Belum ada data yang siap dinilai");
      if (!can(viewerRole(state, project.id), "view.save")) return fail("Peranmu tidak dapat menyimpan tampilan");
      const name = (action.name ?? "").trim(), note = action.note?.trim();
      if (!name) return fail("Nama wajib diisi");
      if (name.length > 80) return fail("Nama terlalu panjang");
      if (note && note.length > 500) return fail("Catatan terlalu panjang");
      const [invalid] = validateFilter(action.filter);
      if (invalid) return fail(invalid);
      const view: SavedView = {
        id: id("sv"), projectId: project.id, name, ...(note ? { note } : {}), filter: normalizeFilter(action.filter), mode: action.mode, selection: action.selection,
        activityPct: action.activityPct, transitionPct: action.transitionPct,
        sourceId: current.log.source.sourceId, snapshotId: current.snapshot.id, mappingVersion: current.mappingVersion,
        createdBy: state.viewerId, createdAt: now(),
      };
      const next = { ...state, savedViews: [...state.savedViews, view] };
      return { state: withAudit(next, { action: "tampilan.simpan", objectType: "Tampilan", objectLabel: name, projectId: project.id }), savedViewId: view.id };
    }

    case "confirmSnapshot":
    case "cancelSnapshot": {
      const snap = state.snapshots.find((x) => x.id === action.snapshotId);
      if (!snap) return fail("Snapshot tidak ditemukan");
      const confirm = action.type === "confirmSnapshot";
      const allowed = confirm ? snap.status === "perlu_tinjauan" : ["memvalidasi", "perlu_tinjauan", "siap_dipetakan"].includes(snap.status);
      if (!allowed) return fail(confirm ? "Hanya snapshot yang perlu tinjauan yang bisa dikonfirmasi" : "Snapshot ini tidak bisa dibatalkan");
      const to: SnapshotStatus = confirm ? "siap_dipetakan" : "dibatalkan";
      const next = { ...state, snapshots: state.snapshots.map((x) => (x === snap ? { ...x, status: to } : x)) };
      return { state: withAudit(next, { action: confirm ? "snapshot.konfirmasi" : "snapshot.batal", objectType: "Snapshot", objectLabel: snap.fileName, projectId: snap.projectId }) };
    }

    default: // M11 actions are handled above; this only keeps the switch total for TypeScript.
      return fail("Aksi tidak dikenal");
  }
}

export const snapshotsForSource = (s: MockState, sourceId: string): Snapshot[] =>
  s.snapshots
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.sourceId === sourceId)
    // The mock clock is fixed, so ties on uploadedAt fall back to insertion order (later first).
    .sort((a, b) => b.x.uploadedAt.localeCompare(a.x.uploadedAt) || b.i - a.i)
    .map(({ x }) => x);

export const mappingsForSource = (s: MockState, sourceId: string): MappingVersion[] =>
  s.mappings
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.sourceId === sourceId)
    .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)
    .map(({ x }) => x);

export const latestMapping = (s: MockState, sourceId: string): MappingVersion | null => mappingsForSource(s, sourceId)[0] ?? null;

export const repairRulesForSource = (s: MockState, sourceId: string, onlyActive = false): RepairRule[] =>
  s.repairRules
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.sourceId === sourceId && (!onlyActive || x.active))
    .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)
    .map(({ x }) => x);

export const datasetVersionsForSource = (s: MockState, sourceId: string): DatasetVersion[] =>
  s.datasetVersions
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.sourceId === sourceId)
    .sort((a, b) => b.x.version - a.x.version || b.i - a.i)
    .map(({ x }) => x);

export const latestDataset = (s: MockState, sourceId: string): DatasetVersion | null => datasetVersionsForSource(s, sourceId)[0] ?? null;

// Structural comparison; roles and labels are order-insensitive, note is ignored.
const canon = (m: Pick<MappingVersion, "roles" | "timeFormat" | "timezone" | "labels">) =>
  JSON.stringify([Object.entries(m.roles).sort(), m.timeFormat, m.timezone, m.labels.map((l) => [l.raw, l.canonical]).sort()]);
const sameConfig = (a: MappingVersion, b: Pick<MappingVersion, "roles" | "timeFormat" | "timezone" | "labels">) => canon(a) === canon(b);

export const rulesForProject = (s: MockState, projectId: string): RuleVersion[] => s.rules.filter((r) => r.projectId === projectId);

// Deep canonical JSON with sorted keys, so key order never matters.
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;
const sameRuleInput = (a: RuleInput, b: RuleInput) => {
  const pick = (r: RuleInput) => JSON.stringify(stable([r.name.trim(), r.description, r.params, r.scope, r.effectiveFrom, r.effectiveTo, r.source]));
  return pick(a) === pick(b);
};

// Newest first; equal timestamps fall back to insertion order (later first).
export const interpretationsForProject = (s: MockState, projectId: string): Interpretation[] =>
  s.interpretations
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.projectId === projectId)
    .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)
    .map(({ x }) => x);

export const investigationsForProject = (s: MockState, projectId: string): Investigation[] =>
  s.investigations
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.projectId === projectId)
    .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)
    .map(({ x }) => x);

// Active flags only (not yet cleared), scoped to the project through their decision.
export const flagsForProject = (s: MockState, projectId: string): RevalidationFlag[] =>
  s.flags.filter((f) => !f.clearedAt && s.decisions.some((d) => d.id === f.decisionId && d.projectId === projectId));

export const notificationsFor = (s: MockState, userId: string, projectId: string): Notification[] =>
  s.notifications.filter((n) => n.userId === userId && n.projectId === projectId);

export const findingsForProject = (s: MockState, projectId: string): MockFinding[] => s.findings.filter((f) => f.projectId === projectId);

// Cancelled snapshots never count: their data was not imported.
export function sourceFreshness(s: MockState, sourceId: string): { lastImportAt: string | null; latestEventAt: string | null; stale: boolean } {
  const live = s.snapshots.filter((x) => x.sourceId === sourceId && x.status !== "dibatalkan");
  const max = (xs: (string | undefined)[]) => xs.reduce<string | null>((m, v) => (v && (!m || v > m) ? v : m), null);
  const latestEventAt = max(live.map((x) => x.stats?.latestEventAt));
  return { lastImportAt: max(live.map((x) => x.uploadedAt)), latestEventAt, stale: latestEventAt ? isStale(latestEventAt) : false };
}

export const viewerRole = (s: MockState, projectId: string): Role | null =>
  s.memberships.find((m) => m.projectId === projectId && m.userId === s.viewerId)?.role ?? null;

export const projectsForViewer = (s: MockState): Project[] =>
  s.projects.filter((p) => s.memberships.some((m) => m.projectId === p.id && m.userId === s.viewerId));

export function contractEndingSoon(p: Project, today = MOCK_TODAY): boolean {
  if (p.status !== "aktif" || !p.contractEnd) return false;
  const days = (Date.parse(p.contractEnd) - Date.parse(today)) / 86_400_000;
  return days >= 0 && days <= 14;
}

export const runsForProject = (s: MockState, projectId: string): MonitoringRun[] =>
  s.runs
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.projectId === projectId)
    .sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i)
    .map(({ x }) => x);

export function runnableSources(s: MockState, projectId: string): { source: Source; snapshot: Snapshot; mapping: MappingVersion }[] {
  return s.sources.filter((x) => x.projectId === projectId).flatMap((source) => {
    const snapshot = snapshotsForSource(s, source.id).find((x) => x.status === "siap_dipetakan");
    const mapping = latestMapping(s, source.id);
    return snapshot && mapping ? [{ source, snapshot, mapping }] : [];
  });
}
