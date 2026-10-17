import { activityLabels, hash } from "./mapping";
import type { Capability, CheckId, MappingVersion, MockState, Project, RepairAction, RepairRule, Severity, Snapshot } from "./types";

export const CHECK_META: Record<CheckId, { title: string; severity: Severity }> = {
  nilai_hilang: { title: "Nilai hilang pada kolom wajib", severity: "tinggi" },
  waktu_tidak_wajar: { title: "Waktu tidak wajar", severity: "tinggi" },
  duplikasi: { title: "Duplikasi dan konflik event", severity: "sedang" },
  urutan_ambigu: { title: "Urutan event ambigu", severity: "sedang" },
  kasus_belum_selesai: { title: "Kasus belum selesai", severity: "info" },
  waktu_mulai_selesai: { title: "Waktu mulai lebih besar dari waktu selesai", severity: "tinggi" },
  label_belum_dipetakan: { title: "Label aktivitas belum dipetakan", severity: "sedang" },
  di_luar_periode: { title: "Kasus di luar periode kontrak", severity: "info" },
};
export const VERDICT_LABEL: Record<"siap" | "siap_catatan" | "belum_layak", string> = {
  siap: "Siap analisis", siap_catatan: "Siap dengan catatan", belum_layak: "Belum layak",
};
export const ACTION_LABEL: Record<RepairAction, string> = {
  kecualikan_event: "Kecualikan event", kecualikan_kasus: "Kecualikan kasus", terima: "Terima apa adanya",
};

export type QualityDataset = { snapshot: Snapshot; mapping: MappingVersion; project: Project };
export interface QualityFinding {
  id: CheckId; title: string; severity: Severity;
  status: "ditemukan" | "bersih" | "tidak_berlaku" | "tidak_diketahui";
  affectedEvents: number; affectedCases: number; percent: number;
  examples: { row: number; text: string }[];
  explanation: string;
}
export interface QualityReport {
  snapshotId: string; mappingId: string; totalEvents: number; totalCases: number;
  findings: QualityFinding[]; excludedEvents: number; excludedCases: number;
  eventsIncluded: number; casesIncluded: number;
  verdict: "siap" | "siap_catatan" | "belum_layak"; reasons: string[];
}

const EXAMPLE_TEXT: Record<CheckId, string> = {
  nilai_hilang: "ID kasus kosong",
  waktu_tidak_wajar: "waktu di luar jangkauan",
  duplikasi: "event identik dengan baris sebelumnya",
  urutan_ambigu: "stempel waktu sama dengan event lain di kasus yang sama",
  kasus_belum_selesai: "",
  waktu_mulai_selesai: "waktu mulai lebih besar dari waktu selesai",
  label_belum_dipetakan: "label aktivitas belum dipetakan",
  di_luar_periode: "waktu di luar masa kontrak proyek",
};
const EXPLANATION: Record<CheckId, string> = {
  nilai_hilang: "Event tanpa ID kasus, aktivitas, atau waktu tidak bisa dipakai dalam analisis.",
  waktu_tidak_wajar: "Waktu yang mustahil atau jauh di luar rentang data membuat durasi menyesatkan.",
  duplikasi: "Event ganda atau bertentangan dari impor sebelumnya dapat menggandakan hitungan.",
  urutan_ambigu: "Event dengan stempel waktu sama dalam satu kasus membuat urutan tidak pasti.",
  kasus_belum_selesai: "Batas proses belum ditetapkan (M04)",
  waktu_mulai_selesai: "Kegiatan yang selesai sebelum dimulai menghasilkan durasi negatif.",
  label_belum_dipetakan: "Beberapa ejaan aktivitas yang sama belum digabung dan tampil sebagai aktivitas terpisah.",
  di_luar_periode: "Data di luar masa kontrak proyek mungkin tidak boleh dianalisis.",
};

const RANGE: Partial<Record<CheckId, [number, number]>> = {
  nilai_hilang: [0.002, 0.03], waktu_tidak_wajar: [0.001, 0.015], urutan_ambigu: [0.02, 0.18], waktu_mulai_selesai: [0.001, 0.01],
};
const fraction = (checksum: string, check: CheckId) => {
  const [lo, hi] = RANGE[check]!;
  return lo + (hi - lo) * ((hash(`${checksum}:${check}`) % 1000) / 1000);
};
const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (events: number, total: number) => (total > 0 ? round1((events / total) * 100) : 0);
const fmtPct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const isExclusion = (r: RepairRule) => r.active && r.action !== "terima";
const DAY = 86_400_000;

// Spelling key: lowercase, collapsed whitespace, trailing . , ; removed (punctuation first, then trim).
const labelKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();

// Raw spellings that share a key with another spelling but are not covered by a mapping rule.
// The most frequent spelling of each group is the display spelling, so it is not counted.
function unmappedLabels(d: QualityDataset): { raw: string; count: number }[] {
  const groups = new Map<string, { raw: string; count: number }[]>();
  for (const l of activityLabels(d.snapshot)) {
    const k = labelKey(l.raw);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const ruled = new Set(d.mapping.labels.map((l) => l.raw));
  const out: { raw: string; count: number }[] = [];
  for (const g of groups.values()) {
    if (new Set(g.map((l) => l.raw)).size < 2) continue;
    const top = g.reduce((a, b) => (b.count > a.count ? b : a));
    out.push(...g.filter((l) => l !== top && !ruled.has(l.raw)));
  }
  return out;
}

function outsidePeriod(d: QualityDataset, rows: number): number {
  const st = d.snapshot.stats;
  if (!st) return 0;
  const day = (s: string | null | undefined) => (s ? Date.parse(s.slice(0, 10)) / DAY : NaN);
  const [from, to, start, end] = [day(st.timeFrom), day(st.timeTo), day(d.project.contractStart), day(d.project.contractEnd)];
  if (![from, to, start].every(Number.isFinite) || to < from) return 0;
  const span = to - from + 1;
  const before = Math.min(span, Math.max(0, start - from));
  const after = Number.isFinite(end) ? Math.min(span, Math.max(0, to - end)) : 0;
  if (before + after <= 0) return 0;
  return Math.min(rows, Math.max(1, Math.round((rows * Math.min(span, before + after)) / span)));
}

export function buildQualityReport(dataset: QualityDataset, repairRules: RepairRule[]): QualityReport {
  const { snapshot, mapping } = dataset;
  const checksum = snapshot.checksum;
  const rows = Math.max(0, snapshot.stats?.rows ?? 0);
  const totalEvents = rows;
  const totalCases = Math.round(rows / 6);
  const rules = repairRules.filter((r) => r.active && r.sourceId === snapshot.sourceId);
  const unmapped = unmappedLabels(dataset);

  const exampleRows = (check: CheckId, events: number): number[] => {
    if (rows < 1 || events <= 0) return [];
    const picks = Array.from({ length: Math.min(5, events) }, (_, i) => 1 + (hash(`${checksum}:${check}:${i}`) % rows));
    return [...new Set(picks)].sort((a, b) => a - b);
  };
  const make = (check: CheckId, events: number, cases?: number, status?: QualityFinding["status"], explanation?: string): QualityFinding => {
    const ev = Math.max(0, events);
    const cs = cases ?? (ev === 0 ? 0 : Math.min(totalCases, Math.ceil(ev / 4)));
    const examples = exampleRows(check, ev).map((row, i) => {
      const text = check === "label_belum_dipetakan" && unmapped.length > 0 ? `${EXAMPLE_TEXT[check]}: ${unmapped[i % unmapped.length].raw}` : EXAMPLE_TEXT[check];
      return { row, text: `baris ${row}: ${text}` };
    });
    return {
      id: check, title: CHECK_META[check].title, severity: CHECK_META[check].severity,
      status: status ?? (ev > 0 ? "ditemukan" : "bersih"), affectedEvents: ev, affectedCases: cs, percent: pct(ev, totalEvents),
      examples, explanation: explanation ?? EXPLANATION[check],
    };
  };
  const byFraction = (check: CheckId) => Math.round(rows * fraction(checksum, check));

  const urutanCases = Math.round(totalCases * fraction(checksum, "urutan_ambigu"));
  const hasStart = Object.values(mapping.roles).includes("timestamp_start");
  const unmappedEvents = unmapped.reduce((n, l) => n + l.count, 0);
  const st = snapshot.stats;

  const findings: QualityFinding[] = [
    make("nilai_hilang", byFraction("nilai_hilang")),
    make("waktu_tidak_wajar", byFraction("waktu_tidak_wajar")),
    make("duplikasi", (st?.duplicateEvents ?? 0) + (st?.conflictEvents ?? 0)),
    make("urutan_ambigu", urutanCases * 3, urutanCases),
    make("kasus_belum_selesai", 0, 0, "tidak_diketahui"),
    hasStart ? make("waktu_mulai_selesai", byFraction("waktu_mulai_selesai")) : make("waktu_mulai_selesai", 0, 0, "tidak_berlaku", "Waktu mulai tidak dipetakan"),
    make("label_belum_dipetakan", unmappedEvents),
    make("di_luar_periode", outsidePeriod(dataset, rows)),
  ];

  const ex = excludedAfter({ totalEvents, totalCases }, rules);
  const reasons = verdictOf(findings, rules, totalEvents);
  return {
    snapshotId: snapshot.id, mappingId: mapping.id, totalEvents, totalCases, findings,
    excludedEvents: ex.events, excludedCases: ex.cases,
    eventsIncluded: totalEvents - ex.events, casesIncluded: totalCases - ex.cases,
    verdict: reasons.verdict, reasons: reasons.reasons,
  };
}

function verdictOf(findings: QualityFinding[], rules: RepairRule[], totalEvents: number) {
  const blocking: string[] = [];
  const notes: string[] = [];
  for (const f of findings) {
    const mine = rules.filter((r) => r.check === f.id);
    if (f.status === "tidak_diketahui") {
      // Accepting the unknown (terima) clears the note; otherwise it always keeps the verdict at "siap_catatan".
      if (!mine.some((r) => r.action === "terima")) notes.push("Status penyelesaian kasus belum diketahui");
      continue;
    }
    if (f.status !== "ditemukan") continue;
    const handled = mine.some((r) => r.action === "terima") ? f.affectedEvents : mine.filter(isExclusion).reduce((n, r) => n + r.impactEvents, 0);
    const effective = Math.max(0, f.affectedEvents - handled);
    if (effective <= 0 || f.severity === "info") continue;
    const sentence = `${f.title} memengaruhi ${fmtPct(pct(effective, totalEvents))} event`;
    if (f.severity === "tinggi" && pct(effective, totalEvents) > 5) blocking.push(sentence);
    else notes.push(sentence);
  }
  const verdict = blocking.length ? "belum_layak" : notes.length ? "siap_catatan" : "siap";
  return { verdict: verdict as QualityReport["verdict"], reasons: [...blocking, ...notes] };
}

// Totals excluded by active exclusion rules (plus an optional hypothetical one), capped at the dataset totals.
export function excludedAfter(
  report: Pick<QualityReport, "totalEvents" | "totalCases">,
  repairRules: RepairRule[],
  extra?: { check: CheckId; events: number; cases: number },
): { events: number; cases: number } {
  const act = repairRules.filter(isExclusion);
  const events = act.reduce((n, r) => n + r.impactEvents, 0) + (extra?.events ?? 0);
  const cases = act.reduce((n, r) => n + r.impactCases, 0) + (extra?.cases ?? 0);
  return { events: Math.min(report.totalEvents, Math.max(0, events)), cases: Math.min(report.totalCases, Math.max(0, cases)) };
}

export function repairImpact(report: QualityReport, check: CheckId): { events: number; cases: number } {
  const f = report.findings.find((x) => x.id === check);
  return { events: f?.affectedEvents ?? 0, cases: f?.affectedCases ?? 0 };
}

export function buildCapabilities(dataset: QualityDataset, report: QualityReport): Capability[] {
  const roles = Object.values(dataset.mapping.roles);
  const urutan = report.findings.find((f) => f.id === "urutan_ambigu");
  const urutanHigh = report.totalCases > 0 && (urutan?.affectedCases ?? 0) / report.totalCases > 0.1;
  return [
    roles.includes("timestamp_start")
      ? { id: "waktu_mulai", label: "Durasi kerja aktivitas", status: "tersedia", explanation: "Durasi kerja tiap aktivitas dapat dihitung dari waktu mulai dan selesai" }
      : { id: "waktu_mulai", label: "Durasi kerja aktivitas", status: "terbatas", explanation: "Durasi kerja aktivitas tidak tersedia; hanya jeda antar-event dan durasi kasus" },
    roles.includes("resource")
      ? { id: "sumber_daya", label: "Beban kerja dan sumber daya", status: "tersedia", explanation: "Analisis beban kerja dan sumber daya dapat dilakukan" }
      : { id: "sumber_daya", label: "Beban kerja dan sumber daya", status: "tidak_tersedia", explanation: "Analisis beban kerja dan sumber daya tidak tersedia" },
    urutanHigh
      ? { id: "urutan", label: "Penemuan alur dan kesesuaian", status: "terbatas", explanation: "Penemuan alur dan pemeriksaan kesesuaian: hasil perlu kehati-hatian" }
      : { id: "urutan", label: "Penemuan alur dan kesesuaian", status: "tersedia", explanation: "Urutan event cukup jelas untuk penemuan alur dan pemeriksaan kesesuaian" },
    { id: "batas_proses", label: "Kasus belum selesai dan SLA", status: "terbatas", explanation: "Analisis kasus belum selesai dan SLA ujung ke ujung terbatas sampai batas proses ditetapkan (M04)" },
    report.casesIncluded < 100
      ? { id: "jumlah_kasus", label: "Perbandingan kelompok dan periode", status: "tidak_tersedia", explanation: "Perbandingan kelompok dan periode dinonaktifkan" }
      : { id: "jumlah_kasus", label: "Perbandingan kelompok dan periode", status: "tersedia", explanation: "Jumlah kasus cukup untuk membandingkan kelompok dan periode" },
  ];
}

// FNV over the configuration, 12 hex: the first 8 from the default seed, the last 4 from a second seed so the leading characters shown in the UI vary.
export function datasetHash(snapshotId: string, mappingId: string, ruleIds: string[]): string {
  const key = `${snapshotId}|${mappingId}|${[...ruleIds].sort().join(",")}`;
  return hash(key).toString(16).padStart(8, "0") + (hash(key, 0x9e3779b1) & 0xffff).toString(16).padStart(4, "0");
}

// Same ordering convention as latestMapping / snapshotsForSource in reducer.ts (reducer imports this module, so no import back).
const newest = <T,>(xs: T[], key: (x: T) => string): T | null =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => key(b.x).localeCompare(key(a.x)) || b.i - a.i)[0]?.x ?? null;

export function qualityDataset(state: MockState, sourceId: string): QualityDataset | null {
  const mapping = newest(state.mappings.filter((m) => m.sourceId === sourceId), (m) => m.createdAt);
  if (!mapping) return null;
  const ready = state.snapshots.filter((s) => s.sourceId === sourceId && s.status === "siap_dipetakan");
  const snapshot = ready.find((s) => s.id === mapping.snapshotId) ?? newest(ready, (s) => s.uploadedAt);
  const project = snapshot ? state.projects.find((p) => p.id === snapshot.projectId) : undefined;
  return snapshot && project ? { snapshot, mapping, project } : null;
}
