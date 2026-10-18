import { hash } from "./mapping";
import { mockCases } from "./compliance";
import { percentile, processActivities } from "./eventlog";
import type { MockCase, MockState, MonitoringConfig, MonitoringRun, Snapshot } from "./types";

export interface MetricDefinition { id: string; name: string; description: string; formula: string; population: string; unit: string; version: number }

const def = (id: string, name: string, description: string, formula: string, population: string, unit: string): MetricDefinition =>
  ({ id, name, description, formula, population, unit, version: 1 });

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  def("kasus_dimulai", "Kasus dimulai", "Jumlah kasus yang mulai pada periode run.", "count(kasus dengan start dalam periode)", "Semua kasus periode", "kasus"),
  def("kasus_selesai", "Kasus selesai", "Jumlah kasus yang sudah mencapai aktivitas akhir proses.", "count(kasus dengan end ≠ null)", "Kasus dimulai", "kasus"),
  def("kasus_terbuka", "Kasus terbuka", "Jumlah kasus yang belum selesai.", "kasus dimulai − kasus selesai", "Kasus dimulai", "kasus"),
  def("durasi_median", "Durasi median", "Lama penyelesaian kasus yang umum terjadi.", "median(end − start) atas kasus selesai, dalam hari", "Kasus selesai", "hari"),
  def("durasi_p90", "Durasi P90", "Lama penyelesaian untuk 1 dari 10 kasus yang paling lambat.", "persentil ke-90 dari (end − start) atas kasus selesai, dalam hari", "Kasus selesai", "hari"),
  def("persen_rework", "Persentase rework", "Porsi kasus yang mengulang aktivitas yang ditetapkan sebagai rework.", "kasus dengan aktivitas rework berulang ÷ kasus dimulai × 100", "Kasus dimulai", "%"),
  def("persen_kepatuhan", "Persentase kepatuhan", "Porsi kasus yang sesuai dengan aturan terstruktur.", "kasus patuh ÷ kasus yang dapat dievaluasi × 100", "Kasus yang dapat dievaluasi", "%"),
  def("umur_terbuka", "Umur kasus terbuka", "Sudah berapa lama kasus yang belum selesai berjalan.", "tanggal acuan − start, atas kasus terbuka, dalam hari", "Kasus terbuka", "hari"),
  def("jeda_transisi", "Jeda transisi", "Waktu tunggu antara dua aktivitas berurutan.", "median/P90(waktu aktivitas berikutnya − waktu aktivitas sebelumnya) per transisi", "Kasus yang melewati transisi", "hari"),
  def("kontribusi_tunggu", "Kontribusi waktu tunggu", "Seberapa besar satu transisi menyumbang total waktu tunggu proses.", "total jeda transisi ÷ total jeda semua transisi × 100", "Semua transisi", "%"),
  def("fitness", "Fitness", "Seberapa sesuai alur kasus dengan model proses acuan.", "kasus yang alurnya sesuai model ÷ kasus yang dinilai (tiruan)", "Kasus dengan model BPMN", "0–1"),
  def("cakupan_data", "Cakupan data", "Porsi kasus yang status penyelesaiannya diketahui.", "kasus selesai ÷ kasus dimulai × 100", "Kasus dimulai", "%"),
];

export function metricDef(id: string): MetricDefinition {
  const m = METRIC_DEFINITIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Metrik tidak dikenal: ${id}`);
  return m;
}

export const defaultConfig = (projectId: string): MonitoringConfig => ({
  projectId, version: 0, bottleneckTopN: 3, bottleneckP90Days: 5, reworkActivities: null, reworkHighPct: 15, complianceHighPct: 10,
  fitnessMin: 0.9, backlogAgeDays: 30, ageBuckets: [7, 30, 90], changePct: 20, minCasesChange: 30, minGroupCases: 100, smallSampleCases: 30,
  bpmnModel: null, updatedBy: null, updatedAt: null,
});

export const configFor = (state: MockState, projectId: string): MonitoringConfig =>
  state.monitoringConfigs.find((c) => c.projectId === projectId) ?? defaultConfig(projectId);

export const copyConfig = (c: MonitoringConfig): MonitoringConfig => ({
  ...c, reworkActivities: c.reworkActivities && [...c.reworkActivities], ageBuckets: [...c.ageBuckets],
  bpmnModel: c.bpmnModel && { ...c.bpmnModel, activities: [...c.bpmnModel.activities] },
});

export const runSnapshot = (state: MockState, run: MonitoringRun): Snapshot | null => state.snapshots.find((s) => s.id === run.snapshotId) ?? null;

export function runCases(state: MockState, run: MonitoringRun): MockCase[] {
  const snapshot = runSnapshot(state, run);
  return snapshot ? mockCases(snapshot, run.periodFrom, run.periodTo) : [];
}

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (c: { start: string; end: string }) => Math.round((toMs(c.end) - toMs(c.start)) / DAY);
const durations = (cases: MockCase[]): number[] => cases.flatMap((c) => (c.end === null ? [] : [days({ start: c.start, end: c.end })]));
const stat = (ds: number[], p: number): number | null => (ds.length === 0 ? null : percentile([...ds].sort((a, b) => a - b), p));

export function summaryCards(state: MockState, run: MonitoringRun) {
  const cases = runCases(state, run);
  const ds = durations(cases);
  return {
    started: cases.length, finished: ds.length, open: cases.length - ds.length,
    medianDays: stat(ds, 0.5), p90Days: stat(ds, 0.9),
    coveragePct: cases.length === 0 ? 0 : (ds.length / cases.length) * 100,
  };
}

const weekStart = (date: string) => {
  const ms = toMs(date);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
};

export function trend(cases: MockCase[], grain: "minggu" | "bulan", smallSample: number) {
  const buckets = new Map<string, MockCase[]>();
  for (const c of cases) {
    const key = grain === "bulan" ? c.start.slice(0, 7) : weekStart(c.start);
    buckets.set(key, [...(buckets.get(key) ?? []), c]);
  }
  return [...buckets].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, cs]) => {
    const ds = durations(cs);
    return { bucket, started: cs.length, finished: ds.length, medianDays: stat(ds, 0.5), small: cs.length < smallSample };
  });
}

export type Backlog =
  | { unknown: true }
  | { unknown: false; reference: string; open: number; buckets: { label: string; count: number }[]; lastActivities: { activity: string; count: number }[]; aged: number; caseIds: string[] };

export function backlog(state: MockState, run: MonitoringRun): Backlog {
  const project = state.projects.find((p) => p.id === run.projectId);
  const end = project?.process.endActivity;
  if (!project || !end) return { unknown: true };
  const snapshot = runSnapshot(state, run);
  const mapping = state.mappings.find((m) => m.id === run.mappingId);
  const reference = snapshot?.stats?.timeTo ?? run.periodTo;
  const open = runCases(state, run).flatMap((c) => (c.end === null ? [{ id: c.id, age: Math.round((toMs(reference) - toMs(c.start)) / DAY) }] : []))
    .sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1));
  const bounds = run.config.ageBuckets;
  const labels = [`0–${bounds[0]} hari`, ...bounds.slice(1).map((b, i) => `${bounds[i] + 1}–${b} hari`), `> ${bounds[bounds.length - 1]} hari`];
  const buckets = labels.map((label) => ({ label, count: 0 }));
  for (const c of open) {
    const i = bounds.findIndex((b) => c.age <= b);
    buckets[i === -1 ? bounds.length : i].count++;
  }
  const acts = snapshot && mapping ? processActivities(snapshot, mapping).filter((a) => a !== end) : [];
  const last = new Map<string, number>();
  for (const c of open) {
    const a = acts.length === 0 ? "Tidak diketahui" : acts[hash(c.id + ":last") % acts.length];
    last.set(a, (last.get(a) ?? 0) + 1);
  }
  return {
    unknown: false, reference, open: open.length, buckets,
    lastActivities: [...last].map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count || (a.activity < b.activity ? -1 : 1)),
    aged: open.filter((c) => c.age > run.config.backlogAgeDays).length,
    caseIds: open.map((c) => c.id),
  };
}

const BINS = ["0–5", "6–10", "11–15", "16–20", "21–25", "26–30", "> 30"];
export function durationHistogram(ds: number[]): { bin: string; count: number }[] {
  const out = BINS.map((bin) => ({ bin, count: 0 }));
  for (const d of ds) out[d > 30 ? 6 : Math.max(0, Math.ceil(d / 5) - 1)].count++;
  return out;
}

export interface GroupStats { label: string; cases: number; finished: number; medianDays: number | null; p90Days: number | null; comparable: boolean; histogram: { bin: string; count: number }[] }

const groupStats = (label: string, cases: MockCase[], minGroupCases: number): GroupStats => {
  const ds = durations(cases);
  return { label, cases: cases.length, finished: ds.length, medianDays: stat(ds, 0.5), p90Days: stat(ds, 0.9), comparable: cases.length >= minGroupCases, histogram: durationHistogram(ds) };
};

export function comparePeriods(state: MockState, run: MonitoringRun, a: { from: string; to: string }, b: { from: string; to: string }): { groups: GroupStats[] } {
  const snapshot = runSnapshot(state, run);
  return { groups: [a, b].map((p) => groupStats(`${p.from}–${p.to}`, snapshot ? mockCases(snapshot, p.from, p.to) : [], run.config.minGroupCases)) };
}

export function groupAttributes(state: MockState, run: MonitoringRun): string[] {
  const mapping = state.mappings.find((m) => m.id === run.mappingId);
  return mapping ? Object.entries(mapping.roles).filter(([, r]) => r === "resource" || r === "case_attr" || r === "event_attr").map(([name]) => name) : [];
}

export function compareGroups(state: MockState, run: MonitoringRun, attribute: string): { groups: GroupStats[] } {
  const samples = runSnapshot(state, run)?.columns?.find((c) => c.name === attribute)?.samples ?? [];
  const values = [...new Set(samples)];
  if (values.length === 0) values.push("(kosong)");
  const k = values.length;
  const total = (k * (k + 1)) / 2;
  const members = values.map(() => [] as MockCase[]);
  for (const c of runCases(state, run)) {
    let r = hash(`${c.id}:${attribute}`) % total;
    let i = 0;
    while (r >= k - i) { r -= k - i; i++; }
    members[i].push(c);
  }
  return { groups: values.map((v, i) => groupStats(v, members[i], run.config.minGroupCases)) };
}
