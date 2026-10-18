import { parseBpmn } from "./bpmn";
import { TIMEZONES, hash } from "./mapping";
import { isDate } from "./rules";
import type { Condition, ConfigData, ConfigKind, ConfigVersion, MappingVersion, Snapshot } from "./types";

export const CONFIG_KIND_LABEL: Record<ConfigKind, string> = {
  boundary: "Batas proses", rework: "Definisi rework", population: "Populasi metrik", calendar: "Kalender kerja",
  bpmn: "Model BPMN", hypothesis: "Hipotesis", intervention: "Intervensi", rubric: "Rubrik",
};
/** One configuration per project (key = kind). */
export const SINGLETON_KINDS: readonly ConfigKind[] = ["boundary", "rework", "calendar"];
/** PRD Story 7: the process owner confirms business rules and process boundaries. */
export const CLIENT_CONFIRM_KINDS: readonly ConfigKind[] = ["boundary", "rework", "population"];
export const WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;
export const CONDITION_KIND_LABEL: Record<Condition["kind"], string> = { capability: "Kemampuan data (M03)", metric: "Metrik (M06)", case_attr: "Atribut kasus" };

export type ConfigInput = { name: string; data: ConfigData };
export type Dataset = { snapshot: Snapshot; mapping: MappingVersion } | null;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";

export function validateCondition(c: Condition, field: string): { field: string; message: string }[] {
  const out: { field: string; message: string }[] = [];
  if (blank(c.subject)) out.push({ field: `${field}.subject`, message: "Subjek syarat wajib diisi" });
  if (c.op !== "ada" && blank(c.value)) out.push({ field: `${field}.value`, message: "Nilai syarat wajib diisi" });
  return out;
}

export function validateConfig(input: ConfigInput, labels: string[]): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  const known = new Set(labels);
  const activity = (field: string, v: string) => { if (blank(v)) err(field, "Pilih aktivitas"); };
  if (blank(input.name)) err("name", "Nama wajib diisi");
  const d = input.data;
  switch (d.kind) {
    case "boundary":
      if (!d.starts.length) err("starts", "Pilih minimal satu aktivitas awal");
      if (!d.ends.length) err("ends", "Pilih minimal satu aktivitas akhir");
      if (d.starts.some((a) => d.ends.includes(a))) err("ends", "Aktivitas awal dan akhir tidak boleh sama");
      if (d.idleDays != null && (!Number.isInteger(d.idleDays) || d.idleDays < 1 || d.idleDays > 3650)) err("idleDays", "Jumlah hari harus bilangan bulat 1 sampai 3650");
      break;
    case "rework":
      if (!d.repeated && !d.returns.length) err("repeated", "Pilih minimal satu definisi rework");
      d.returns.forEach((r, i) => {
        activity(`returns.${i}.from`, r.from);
        activity(`returns.${i}.to`, r.to);
        if (r.from && r.from === r.to) err(`returns.${i}.to`, "Aktivitas tidak boleh sama");
      });
      break;
    case "population":
      if (d.periodFrom != null && !isDate(d.periodFrom)) err("periodFrom", "Tanggal tidak valid (YYYY-MM-DD)");
      if (d.periodTo != null && !isDate(d.periodTo)) err("periodTo", "Tanggal tidak valid (YYYY-MM-DD)");
      if (d.periodFrom && d.periodTo && isDate(d.periodFrom) && isDate(d.periodTo) && d.periodTo < d.periodFrom) err("periodTo", "Tanggal akhir tidak boleh sebelum tanggal awal");
      if (d.filter && (blank(d.filter.attribute) || blank(d.filter.value))) err("filter", "Atribut dan nilai filter wajib diisi");
      break;
    case "calendar":
      if (!(TIMEZONES as readonly string[]).includes(d.timezone)) err("timezone", "Pilih zona waktu");
      if (!d.workDays.length || d.workDays.some((x) => !Number.isInteger(x) || x < 1 || x > 7)) err("workDays", "Pilih minimal satu hari kerja");
      if (!TIME.test(d.startTime)) err("startTime", "Jam mulai tidak valid (HH:MM)");
      if (!TIME.test(d.endTime)) err("endTime", "Jam selesai tidak valid (HH:MM)");
      else if (TIME.test(d.startTime) && d.endTime <= d.startTime) err("endTime", "Jam selesai harus setelah jam mulai");
      d.holidays.forEach((h, i) => {
        if (!isDate(h.date)) err(`holidays.${i}.date`, "Tanggal libur tidak valid (YYYY-MM-DD)");
        else if (d.holidays.findIndex((x) => x.date === h.date) !== i) err(`holidays.${i}.date`, "Tanggal libur ganda");
      });
      break;
    case "bpmn": {
      const parsed = parseBpmn(d.xml);
      if (!parsed.ok) err("xml", parsed.reason);
      d.mappings.forEach((m, i) => m.labels.forEach((l) => { if (!known.has(l)) err(`mappings.${i}`, `Label ${l} tidak ada di label kanonis`); }));
      break;
    }
    case "hypothesis":
      if (blank(d.statement)) err("statement", "Pernyataan hipotesis wajib diisi");
      if (blank(d.symptom)) err("symptom", "Gejala terukur wajib diisi");
      if (blank(d.evidence)) err("evidence", "Bukti yang dibutuhkan wajib diisi");
      d.conditions.forEach((c, i) => errors.push(...validateCondition(c, `conditions.${i}`)));
      break;
    case "intervention":
      if (blank(d.action)) err("action", "Deskripsi tindakan wajib diisi");
      if (!d.hypotheses.length) err("hypotheses", "Pilih minimal satu hipotesis yang ditangani");
      if (blank(d.metric)) err("metric", "Metrik keberhasilan wajib diisi");
      d.conditions.forEach((c, i) => errors.push(...validateCondition(c, `conditions.${i}`)));
      break;
    case "rubric": {
      if (!d.criteria.length) err("criteria", "Tambahkan minimal satu kriteria");
      let total = 0;
      d.criteria.forEach((c, i) => {
        if (blank(c.name)) err(`criteria.${i}.name`, "Nama kriteria wajib diisi");
        if (!Number.isFinite(c.weight) || c.weight <= 0) err(`criteria.${i}.weight`, "Bobot harus lebih dari 0");
        else total += c.weight;
        if (c.scale.length < 2) err(`criteria.${i}.scale`, "Skala minimal dua nilai");
        if (c.scale.some((s) => blank(s.definition))) err(`criteria.${i}.scale`, "Setiap nilai skala butuh definisi");
        if (new Set(c.scale.map((s) => s.value)).size !== c.scale.length) err(`criteria.${i}.scale`, "Nilai skala tidak boleh ganda");
      });
      if (d.criteria.length && Math.abs(total - 100) > 0.001) err("criteria", `Total bobot harus 100 (sekarang ${Math.round(total * 100) / 100})`);
      break;
    }
  }
  return errors;
}

/** Non-blocking notes: a boundary activity that the dataset does not contain can still be saved for future datasets. */
export function configWarnings(data: ConfigData, labels: string[]): string[] {
  if (data.kind !== "boundary" || !labels.length) return [];
  const known = new Set(labels);
  return [...data.starts, ...data.ends].filter((a) => !known.has(a)).map((a) => `Aktivitas ${a} tidak muncul di dataset terpilih`);
}

export type DefinitionImpact =
  | { status: "ok"; cases: number; completed: number; incomplete: number; rework: number }
  | { status: "tidak_dapat_dievaluasi"; reason: string };

// Same stable-key idea as previewRule: sorted keys so property order never changes the result.
const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)])) : v;

/** Mock impact of a process definition on the project's sample data (finished / unfinished / rework cases). For a population, `cases` is the included population. */
export function definitionImpact(data: ConfigData, dataset: Dataset): DefinitionImpact {
  if (!dataset) return { status: "tidak_dapat_dievaluasi", reason: "Belum ada pemetaan data (M03)" };
  const rows = dataset.snapshot.stats?.rows;
  const total = Math.round((typeof rows === "number" && Number.isFinite(rows) ? Math.max(0, rows) : 0) / 6);
  const key = `${JSON.stringify(stable(data))}|${dataset.snapshot.checksum}`;
  const completed = Math.round(total * (0.55 + (hash(key) % 400) / 1000));
  const rework = Math.round(total * (0.05 + (hash(key, 0x9e3779b1) % 250) / 1000));
  let cases = total;
  if (data.kind === "population") {
    cases = data.completedOnly ? completed : total;
    if (data.filter) cases = Math.round(cases * (0.4 + (hash(key, 7) % 400) / 1000));
  }
  return { status: "ok", cases, completed, incomplete: total - completed, rework };
}

export function latestConfigs(configs: ConfigVersion[]): ConfigVersion[] {
  const best = new Map<string, ConfigVersion>();
  for (const c of configs) {
    const cur = best.get(c.key);
    if (!cur || c.version >= cur.version) best.set(c.key, c);
  }
  return configs.map((x, i) => ({ x, i })).filter(({ x }) => best.get(x.key) === x).sort((a, b) => b.x.createdAt.localeCompare(a.x.createdAt) || b.i - a.i).map(({ x }) => x);
}

export const conditionText = (c: Condition): string => `${CONDITION_KIND_LABEL[c.kind]}: ${c.subject}${c.op === "ada" ? " tersedia" : ` ${c.op} ${c.value}`}`;

export function configSummary(d: ConfigData): string {
  switch (d.kind) {
    case "boundary": return `Mulai: ${d.starts.join(", ") || "-"}. Selesai: ${d.ends.join(", ") || "-"}.${d.idleDays ? ` Dianggap selesai bila tidak ada event ${d.idleDays} hari.` : ""}`;
    case "rework": return [d.repeated && "Aktivitas yang sama terjadi lebih dari sekali dalam satu kasus", ...d.returns.map((r) => `Kembali ke ${r.to} setelah ${r.from}`)].filter(Boolean).join("; ");
    case "population": return `${d.completedOnly ? "Kasus selesai saja" : "Semua kasus"}${d.periodFrom || d.periodTo ? `, ${d.periodFrom ?? "awal"} sampai ${d.periodTo ?? "sekarang"}` : ""}${d.filter ? `, ${d.filter.attribute} ${d.filter.op} ${d.filter.value}` : ""}`;
    case "calendar": return `${d.workDays.map((x) => WEEKDAYS[x - 1]).join(", ")} ${d.startTime}-${d.endTime} (${d.timezone}), ${d.holidays.length} hari libur`;
    case "bpmn": return d.fileName;
    case "hypothesis": return d.statement;
    case "intervention": return d.action;
    case "rubric": return `${d.criteria.length} kriteria`;
  }
}
