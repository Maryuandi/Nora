import { activityLabels, hash } from "./mapping";
import type { MappingVersion, MockState, RuleParams, RuleScope, RuleSourceRef, RuleStatus, RuleType, RuleVersion, Snapshot } from "./types";

export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  sla: "SLA durasi", urutan: "Urutan", wajib: "Aktivitas wajib", terlarang: "Aktivitas terlarang", pemisahan_tugas: "Pemisahan tugas",
};
export const RULE_STATUS_LABEL: Record<RuleStatus, string> = { draf: "Draf", ditinjau: "Ditinjau", disetujui: "Disetujui", usang: "Usang" };

export type RuleInput = {
  name: string; description: string; params: RuleParams; scope: RuleScope | null; effectiveFrom: string; effectiveTo: string | null; source: RuleSourceRef;
};
export type RulePreview =
  | { status: "ok"; evaluable: number; compliant: number; nonCompliant: number }
  | { status: "tidak_dapat_dievaluasi"; reason: string };

// Same ordering rule as reducer.ts (newest createdAt first, ties: later index first), kept local to avoid importing the reducer.
const newestFirst = <T>(items: T[], at: (x: T) => string): T[] =>
  items.map((x, i) => ({ x, i })).sort((a, b) => at(b.x).localeCompare(at(a.x)) || b.i - a.i).map(({ x }) => x);
const byCreated = (x: { createdAt: string }) => x.createdAt;

const latestMappingOf = (s: MockState, sourceId: string): MappingVersion | undefined =>
  newestFirst(s.mappings.filter((m) => m.sourceId === sourceId), byCreated)[0];

export function canonicalLabels(state: MockState, sourceId: string): string[] {
  const mapping = latestMappingOf(state, sourceId);
  const snapshot = mapping && state.snapshots.find((x) => x.id === mapping.snapshotId);
  if (!mapping || !snapshot) return [];
  const rules = new Map(mapping.labels.map((l) => [l.raw, l.canonical]));
  const out = new Set<string>();
  for (const { raw } of activityLabels(snapshot)) {
    const canonical = rules.has(raw) ? rules.get(raw) : raw;
    if (canonical == null) continue; // excluded
    const name = canonical.trim();
    if (name) out.add(name);
  }
  return [...out].sort();
}

export function projectCanonicalLabels(state: MockState, projectId: string): string[] {
  const all = state.sources.filter((x) => x.projectId === projectId).flatMap((x) => canonicalLabels(state, x.id));
  return [...new Set(all)].sort();
}

export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function validateRule(input: RuleInput, labels: string[]): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  const known = new Set(labels);
  const activity = (field: string, v: unknown) => {
    if (typeof v !== "string" || v.trim() === "") err(field, "Pilih aktivitas");
    else if (!known.has(v)) err(field, "Aktivitas tidak ada di label kanonis");
  };

  if (typeof input.name !== "string" || input.name.trim() === "") err("name", "Nama aturan wajib diisi");
  const p = input.params;
  switch (p.type) {
    case "sla":
      activity("params.from", p.from);
      activity("params.to", p.to);
      if (p.from === p.to && p.from) err("params.to", "Aktivitas awal dan akhir tidak boleh sama");
      if (typeof p.limit !== "number" || !Number.isFinite(p.limit) || p.limit <= 0) err("params.limit", "Batas harus bilangan lebih dari 0");
      if (p.unit !== "kalender" && p.unit !== "kerja") err("params.unit", "Pilih satuan hari kalender atau hari kerja");
      break;
    case "urutan":
      activity("params.before", p.before);
      activity("params.after", p.after);
      if (p.before === p.after && p.before) err("params.after", "Aktivitas sebelum dan sesudah tidak boleh sama");
      break;
    case "wajib":
    case "terlarang":
      activity("params.activity", p.activity);
      break;
    case "pemisahan_tugas":
      activity("params.activityA", p.activityA);
      activity("params.activityB", p.activityB);
      if (p.activityA === p.activityB && p.activityA) err("params.activityB", "Kedua aktivitas tidak boleh sama");
      break;
  }
  if (input.scope) {
    if (typeof input.scope.attribute !== "string" || input.scope.attribute.trim() === "") err("scope.attribute", "Pilih atribut cakupan");
    if (typeof input.scope.value !== "string" || input.scope.value.trim() === "") err("scope.value", "Nilai cakupan wajib diisi");
  }
  const fromOk = isDate(input.effectiveFrom);
  if (!fromOk) err("effectiveFrom", "Tanggal mulai berlaku tidak valid (YYYY-MM-DD)");
  if (input.effectiveTo != null) {
    if (!isDate(input.effectiveTo)) err("effectiveTo", "Tanggal berakhir tidak valid (YYYY-MM-DD)");
    else if (fromOk && input.effectiveTo < input.effectiveFrom) err("effectiveTo", "Tanggal berakhir tidak boleh sebelum tanggal mulai");
  }
  return errors;
}

export function previewDataset(state: MockState, projectId: string): { sourceId: string; snapshot: Snapshot; mapping: MappingVersion } | null {
  for (const source of state.sources.filter((x) => x.projectId === projectId)) {
    const mapping = latestMappingOf(state, source.id);
    // Intentionally the newest siap_dipetakan snapshot, while canonicalLabels uses mapping.snapshotId (mock simplification).
    const snapshot = newestFirst(state.snapshots.filter((x) => x.sourceId === source.id && x.status === "siap_dipetakan"), (x) => x.uploadedAt)[0];
    if (mapping && snapshot) return { sourceId: source.id, mapping, snapshot };
  }
  return null;
}

const NO_DATA = (reason: string): RulePreview => ({ status: "tidak_dapat_dievaluasi", reason });

export function previewRule(input: { params: RuleParams; scope: RuleScope | null }, dataset: { snapshot: Snapshot; mapping: MappingVersion } | null): RulePreview {
  if (!dataset) return NO_DATA("Belum ada pemetaan data (M03)");
  const { snapshot, mapping } = dataset;
  const roles = Object.values(mapping.roles);
  if (input.params.type === "pemisahan_tugas" && !roles.includes("resource")) return NO_DATA("Kolom sumber daya belum dipetakan (M03)");
  const attr = input.scope?.attribute;
  if (input.scope && !(typeof attr === "string" && Object.hasOwn(mapping.roles, attr) && ["case_attr", "event_attr"].includes(mapping.roles[attr]))) {
    return NO_DATA(`Atribut ${attr} belum dipetakan (M03)`);
  }
  // Stable key: sorted keys so property order never changes the result (params and scope are flat objects).
  const stable = (o: object | null) => JSON.stringify(o, o ? Object.keys(o).sort() : undefined);
  const key = `${input.params.type}|${stable(input.params)}|${stable(input.scope)}|${snapshot.checksum}`;
  const rows = snapshot.stats?.rows;
  const cases = Math.round((typeof rows === "number" && Number.isFinite(rows) ? Math.max(0, rows) : 0) / 6);
  const lo = Math.ceil(cases * 0.6);
  const evaluable = lo + Math.floor((cases - lo + 1) * ((hash(key) % 1000) / 1000));
  const cLo = Math.ceil(evaluable * 0.55);
  const compliant = cLo + Math.floor((Math.max(cLo, Math.floor(evaluable * 0.97)) - cLo + 1) * ((hash(key, 0x9e3779b1) % 1000) / 1000));
  return { status: "ok", evaluable, compliant, nonCompliant: evaluable - compliant };
}

const NEXT: Record<RuleStatus, RuleStatus[]> = { draf: ["ditinjau"], ditinjau: ["draf", "disetujui"], disetujui: ["usang"], usang: [] };
export const nextStatuses = (status: RuleStatus): RuleStatus[] => (Object.hasOwn(NEXT, status) ? [...NEXT[status]] : []);

export function latestByKey(rules: RuleVersion[]): RuleVersion[] {
  const best = new Map<string, RuleVersion>();
  for (const r of rules) {
    const cur = best.get(r.ruleKey);
    if (!cur || r.version >= cur.version) best.set(r.ruleKey, r);
  }
  return newestFirst(rules.filter((r) => best.get(r.ruleKey) === r), byCreated);
}

export function ruleSummary(p: RuleParams): string {
  switch (p.type) {
    case "sla": return `Dari ${p.from} sampai ${p.to} tidak lebih dari ${p.limit} hari ${p.unit === "kerja" ? "kerja" : "kalender"}`;
    case "urutan": return `${p.before} harus terjadi sebelum ${p.after}`;
    case "wajib": return `Setiap kasus harus memuat aktivitas ${p.activity}`;
    case "terlarang": return `Aktivitas ${p.activity} tidak boleh terjadi`;
    case "pemisahan_tugas": return `${p.activityA} dan ${p.activityB} pada kasus yang sama tidak boleh dilakukan oleh orang yang sama`;
    default: return "";
  }
}
