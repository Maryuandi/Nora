import type { ColumnRole, LabelRule, Snapshot } from "./types";

export const TIME_FORMATS = ["YYYY-MM-DD HH:mm:ss", "DD/MM/YYYY HH:mm"] as const;
export const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"] as const;
export const REQUIRED_ROLES: readonly ColumnRole[] = ["case_id", "activity", "timestamp_end"];
export const ROLE_LABEL: Record<ColumnRole, string> = {
  case_id: "ID kasus", activity: "Aktivitas", timestamp_end: "Waktu selesai", timestamp_start: "Waktu mulai", resource: "Sumber daya",
  event_id: "ID event asli", lifecycle: "Siklus hidup", case_attr: "Atribut kasus", event_attr: "Atribut event", ignore: "Abaikan",
};
const UNKNOWN = "tidak dikenali";
const GENERIC_ACTIVITIES = ["Create Order", "Approve Order", "Ship Goods", "Send Invoice", "Receive Payment"];
const NOISE_LABEL = "Cancel Invoice Receipt";
const MAX_PREVIEW = 50;

type Col = { name: string; samples: string[] };
export type PreviewRow = { caseId: string; activityRaw: string; activity: string; excluded: boolean; timeSource: string; timeUtc: string | null; resource: string };

const own = (o: Record<string, ColumnRole>, k: string): ColumnRole | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

// ---- suggestRoles ----
const NAME_ROLE: [ColumnRole, string[]][] = [
  ["case_id", ["case", "caseid", "case:concept:name"]],
  ["activity", ["activity", "aktivitas", "concept:name"]],
  ["timestamp_end", ["timestamp", "time", "waktu", "time:timestamp"]],
  ["resource", ["resource", "org:resource", "user"]],
  ["lifecycle", ["lifecycle:transition"]],
];

export function suggestRoles(columns: Col[]): Record<string, ColumnRole> {
  const taken = new Set<ColumnRole>();
  return Object.fromEntries(
    columns.map(({ name }) => {
      const key = name.toLowerCase().replace(/[\s_]+/g, "");
      const hit = NAME_ROLE.find(([role, names]) => !taken.has(role) && names.includes(key));
      if (!hit) return [name, "event_attr" as ColumnRole];
      taken.add(hit[0]);
      return [name, hit[0]];
    }),
  );
}

// ---- time ----
const PATTERNS: Record<string, RegExp> = {
  "YYYY-MM-DD HH:mm:ss": /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  "DD/MM/YYYY HH:mm": /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/,
};

export function detectTimeFormat(samples: string[]): string {
  if (samples.length === 0) return UNKNOWN;
  return TIME_FORMATS.find((f) => samples.every((s) => PATTERNS[f].test(s))) ?? UNKNOWN;
}

// shortcut: offset tetap, tidak ada DST di zona ini
const OFFSET_HOURS: Record<string, number> = { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9, UTC: 0 };

function toUtc(text: string, format: string, timezone: string): string | null {
  const m = Object.hasOwn(PATTERNS, format) ? PATTERNS[format].exec(text) : null;
  const off = Object.hasOwn(OFFSET_HOURS, timezone) ? OFFSET_HOURS[timezone] : undefined;
  if (!m || off === undefined) return null;
  const n = m.slice(1).map(Number);
  const [y, mo, d, h, mi, s] = format === "DD/MM/YYYY HH:mm" ? [n[2], n[1], n[0], n[3], n[4], 0] : n;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Reject impossible dates (31/09, hour 25) that Date.UTC silently rolls over.
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== mi) return null;
  return new Date(t.getTime() - off * 3_600_000).toISOString().replace(".000Z", "Z");
}

// ---- activityLabels ----
// Local copy of the FNV-1a helper in reducer.ts (reducer will import this module, so no import back); returns a number.
export function hash(text: string, seed = 2166136261): number {
  let x = seed;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619) >>> 0;
  return x;
}

function variantOf(base: string, i: number, key: string): string {
  if (i === 0) return base.toLowerCase();
  if (i === 1) return `${base} `;
  return hash(`${key}:${base}`) % 2 === 0 ? base.replace(" ", "  ") : `${base}.`;
}

export function activityLabels(snapshot: Snapshot): { raw: string; count: number }[] {
  const rows = snapshot.stats?.rows;
  if (rows === undefined) return [];
  const actCol = snapshot.columns ? Object.entries(suggestRoles(snapshot.columns)).find(([, r]) => r === "activity")?.[0] : undefined;
  const idx = actCol === undefined ? -1 : snapshot.columns!.findIndex((c) => c.name === actCol);
  const real = idx < 0 ? [] : [...new Set((snapshot.preview ?? []).map((r) => r[idx]).filter((v): v is string => !!v))];
  const bases = real.slice(0, 5);
  // Pad so that bases + variants + noise reaches at least 8 labels.
  for (const g of GENERIC_ACTIVITIES) if (bases.length < 4 && !bases.includes(g)) bases.push(g);

  const entries: { raw: string; weight: number }[] = [];
  const seen = new Set<string>();
  const add = (raw: string, weight: number) => { if (!seen.has(raw)) { seen.add(raw); entries.push({ raw, weight }); } };
  bases.forEach((b) => add(b, 40 + (hash(`${snapshot.checksum}:${b}`) % 20)));
  bases.forEach((b, i) => add(variantOf(b, i, snapshot.checksum), 3 + (hash(`${snapshot.checksum}:v:${b}`) % 6)));
  add(NOISE_LABEL, 1);

  const total = entries.reduce((n, e) => n + e.weight, 0);
  const counts = entries.map((e) => Math.floor((rows * e.weight) / total));
  counts[0] += rows - counts.reduce((n, c) => n + c, 0); // remainder goes to the first base label so the sum stays exact
  return entries.map((e, i) => ({ raw: e.raw, count: counts[i] })).sort((a, b) => b.count - a.count || (a.raw < b.raw ? -1 : 1));
}

// ---- suggestGroups ----
const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/[\p{P}\s]+$/u, "");

export function suggestGroups(labels: { raw: string; count: number }[]): { canonical: string; raws: string[] }[] {
  const groups = new Map<string, { raw: string; count: number }[]>();
  for (const l of labels) {
    const k = normalize(l.raw);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => ({ canonical: g.reduce((a, b) => (b.count > a.count ? b : a)).raw, raws: g.map((l) => l.raw) }));
}

// ---- previewEvents ----
export function previewEvents(input: { snapshot: Snapshot; roles: Record<string, ColumnRole>; timeFormat: string; timezone: string; labels: LabelRule[] }): PreviewRow[] {
  const { snapshot, roles, timeFormat, timezone, labels } = input;
  const cols = snapshot.columns ?? [];
  const at = (role: ColumnRole) => cols.findIndex((c) => own(roles, c.name) === role);
  const [ci, ai, ti, ri] = [at("case_id"), at("activity"), at("timestamp_end"), at("resource")];
  const rules = new Map(labels.map((l) => [l.raw, l.canonical]));
  return (snapshot.preview ?? []).slice(0, MAX_PREVIEW).map((row) => {
    const activityRaw = ai < 0 ? "" : (row[ai] ?? "");
    const canonical = rules.get(activityRaw);
    const timeSource = ti < 0 ? "" : (row[ti] ?? "");
    return {
      caseId: ci < 0 ? "" : (row[ci] ?? ""),
      activityRaw,
      activity: canonical ? canonical : activityRaw,
      excluded: canonical === null,
      timeSource,
      timeUtc: toUtc(timeSource, timeFormat, timezone),
      resource: ri < 0 ? "" : (row[ri] ?? ""),
    };
  });
}

// ---- validateMapping ----
export function validateMapping(input: {
  columns: string[]; roles: Record<string, ColumnRole>; confirmed: ColumnRole[]; timezoneConfirmed: boolean; timezone: string; timeFormat: string; labels: LabelRule[];
}): { field: string; message: string }[] {
  const { columns, roles, confirmed, timezoneConfirmed, timezone, timeFormat, labels } = input;
  const errors: { field: string; message: string }[] = [];
  for (const role of REQUIRED_ROLES) {
    const n = columns.filter((c) => own(roles, c) === role).length;
    const field = `role:${role}`;
    if (n === 0) errors.push({ field, message: `Pilih kolom untuk ${ROLE_LABEL[role]}` });
    else if (n > 1) errors.push({ field, message: "Satu peran hanya untuk satu kolom" });
    else if (!confirmed.includes(role)) errors.push({ field, message: `Konfirmasi kolom ${ROLE_LABEL[role]}` });
  }
  if (!timezoneConfirmed) errors.push({ field: "timezone", message: "Konfirmasi zona waktu sumber" });
  if (!(TIMEZONES as readonly string[]).includes(timezone)) errors.push({ field: "timezone", message: "Zona waktu tidak dikenali" });
  if (!(TIME_FORMATS as readonly string[]).includes(timeFormat)) errors.push({ field: "timeFormat", message: "Pilih format waktu yang dikenali" });

  if (labels.some((l) => l.canonical !== null && l.canonical.trim() === "")) errors.push({ field: "labels", message: "Nama kanonis tidak boleh kosong" });
  const next = new Map(labels.map((l) => [l.raw, l.canonical]));
  const circular = labels.some((l) => {
    let cur = l.canonical;
    for (let i = 0; i <= labels.length && cur != null && next.has(cur); i++) {
      if (cur === l.raw) return l.canonical !== l.raw;
      const n = next.get(cur);
      if (n === cur) return false;
      cur = n ?? null;
    }
    return false;
  });
  if (circular) errors.push({ field: "labels", message: "Pemetaan label tidak boleh melingkar" });
  return errors;
}
