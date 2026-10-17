import { MOCK_TODAY, initialState } from "./data";
import { isStale } from "../format";
import { participatingVersions } from "./compliance";
import { fabricate } from "./fabricate";
import { validateMapping } from "./mapping";
import { acceptsData } from "./permissions";
import { nextStatuses, previewDataset, previewRule, projectCanonicalLabels, validateRule, type RuleInput } from "./rules";
import { projectSchema, type ProjectInput } from "./schemas";
import type { AuditEvent, ColumnRole, LabelRule, MappingVersion, MockState, MonitoringRun, Project, ProjectStatus, Role, RuleStatus, RuleVersion, Snapshot, SnapshotStatus, Source } from "./types";

export { MOCK_TODAY, initialState };

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
  | { type: "runMonitoring"; projectId: string; sourceId: string; periodFrom: string; periodTo: string }
  | { type: "setViewer"; userId: string };

export type ReduceResult = { state: MockState; error?: string; snapshotId?: string; duplicateOf?: string; mappingId?: string; ruleId?: string; runId?: string };

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

// Fixed clock so the demo looks the same every time.
const now = () => `${MOCK_TODAY}T09:30:00Z`;
let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

const withAudit = (state: MockState, e: Omit<AuditEvent, "id" | "at" | "actorId" | "result">): MockState => ({
  ...state,
  audit: [{ id: id("a"), at: now(), actorId: state.viewerId, result: "sukses", ...e }, ...state.audit],
});

const isLastAdmin = (s: MockState, projectId: string, userId: string) => {
  const admins = s.memberships.filter((m) => m.projectId === projectId && m.role === "administrator");
  return admins.length === 1 && admins[0].userId === userId;
};

export function reduce(state: MockState, action: MockAction): ReduceResult {
  const fail = (error: string) => ({ state, error });
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
        periodFrom, periodTo, ruleVersionIds: versions.map((v) => v.id), ruleVersions: versions.map((v) => ({ ...v })), calendar: "bawaan_tiruan", createdBy: state.viewerId, createdAt: now(),
      };
      return { state: withAudit({ ...state, runs: [...state.runs, run] }, { action: "monitoring.jalankan", objectType: "Monitoring", objectLabel: `${source.name} ${periodFrom}–${periodTo}`, projectId: project.id }), runId: run.id };
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

// Structural comparison; roles and labels are order-insensitive, note is ignored.
const canon = (m: Pick<MappingVersion, "roles" | "timeFormat" | "timezone" | "labels">) =>
  JSON.stringify([Object.entries(m.roles).sort(), m.timeFormat, m.timezone, m.labels.map((l) => [l.raw, l.canonical]).sort()]);
const sameConfig = (a: MappingVersion, b: Pick<MappingVersion, "roles" | "timeFormat" | "timezone" | "labels">) => canon(a) === canon(b);

export const rulesForProject = (s: MockState, projectId: string): RuleVersion[] => s.rules.filter((r) => r.projectId === projectId);

// Newest version first; equal versions fall back to insertion order (later first).
export const ruleVersions = (s: MockState, ruleKey: string): RuleVersion[] =>
  s.rules
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.ruleKey === ruleKey)
    .sort((a, b) => b.x.version - a.x.version || b.i - a.i)
    .map(({ x }) => x);

// Deep canonical JSON with sorted keys, so key order never matters.
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;
const sameRuleInput = (a: RuleInput, b: RuleInput) => {
  const pick = (r: RuleInput) => JSON.stringify(stable([r.name.trim(), r.description, r.params, r.scope, r.effectiveFrom, r.effectiveTo, r.source]));
  return pick(a) === pick(b);
};

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
