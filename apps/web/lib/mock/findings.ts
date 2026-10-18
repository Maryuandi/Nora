import { bottlenecks, reworkStats, runLog, transitionCases } from "./bottleneck";
import { evaluateRun, summarize, termFor } from "./compliance";
import { backlog, runCases, trend } from "./metrics";
import { conformance } from "./replay";
import type { MockState, MonitoringConfig, MonitoringRun } from "./types";

export type FindingKind = "bottleneck" | "rework" | "kepatuhan" | "penyimpangan_model" | "backlog" | "tren_memburuk";
export type ChangeStatus = "baru" | "memburuk" | "stabil" | "membaik" | "tidak_lagi_terdeteksi";
export type Severity = "rendah" | "sedang" | "tinggi";

export interface Finding {
  id: string; runId: string; kind: FindingKind; key: string; title: string;
  measure: number; threshold: number; higherIsWorse: boolean; unit: "hari" | "%" | "kasus" | "fitness";
  affectedCases: number; populationCases: number; severity: Severity;
  ruleVersionId?: string; supportingCaseIds: string[]; // maks 50
  caseSource: "log_event" | "kasus";
}

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  bottleneck: "Indikasi bottleneck", rework: "Rework tinggi", kepatuhan: "Ketidakpatuhan aturan/SLA",
  penyimpangan_model: "Penyimpangan model", backlog: "Backlog menua", tren_memburuk: "Tren memburuk",
};
export const CHANGE_LABEL: Record<ChangeStatus, string> = {
  baru: "Baru", memburuk: "Memburuk", stabil: "Stabil", membaik: "Membaik", tidak_lagi_terdeteksi: "Tidak lagi terdeteksi",
};

const DAY = 86_400_000;
const MAX_CASES = 50;
const fmt = (n: number, d = 1) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

export function severityOf(f: Pick<Finding, "affectedCases" | "populationCases" | "measure" | "threshold" | "higherIsWorse">): Severity {
  const share = f.populationCases === 0 ? 0 : f.affectedCases / f.populationCases;
  const ratio = f.threshold === 0 || f.measure === 0 ? 1 : f.higherIsWorse ? f.measure / f.threshold : f.threshold / f.measure;
  const score = share * Math.min(ratio, 3);
  return score >= 0.5 ? "tinggi" : score >= 0.15 ? "sedang" : "rendah";
}

const memo = new WeakMap<MonitoringRun, Finding[]>();

export function findingsFor(state: MockState, run: MonitoringRun): Finding[] {
  const hit = memo.get(run);
  if (hit) return hit;
  const cfg = run.config;
  const out: Finding[] = [];
  const add = (f: Omit<Finding, "id" | "runId" | "severity" | "supportingCaseIds"> & { supportingCaseIds: string[] }) =>
    out.push({ ...f, id: `${run.id}:${f.kind}:${f.key}`, runId: run.id, supportingCaseIds: f.supportingCaseIds.slice(0, MAX_CASES), severity: severityOf(f) });

  const log = runLog(state, run);
  if (log) {
    const b = bottlenecks(log, cfg);
    for (const t of b.transitions.filter((x) => x.indicated)) {
      add({ kind: "bottleneck", key: t.id, measure: t.p90Ms / DAY, threshold: cfg.bottleneckP90Days, higherIsWorse: true, unit: "hari",
        title: `Indikasi bottleneck pada transisi ${t.from} → ${t.to}: P90 ${fmt(t.p90Ms / DAY)} hari, ${fmt(t.sharePct)}% total waktu tunggu`,
        affectedCases: t.caseCount, populationCases: log.cases.length, caseSource: "log_event",
        supportingCaseIds: transitionCases(log, t.from, t.to).map((c) => c.caseId) });
    }
    for (const a of reworkStats(log, cfg)?.activities.filter((x) => x.pct >= cfg.reworkHighPct) ?? []) {
      add({ kind: "rework", key: a.activity, measure: a.pct, threshold: cfg.reworkHighPct, higherIsWorse: true, unit: "%",
        title: `Rework tinggi pada aktivitas ${a.activity}: ${fmt(a.pct)}% kasus mengulang`,
        affectedCases: a.caseIds.length, populationCases: log.cases.length, caseSource: "log_event", supportingCaseIds: a.caseIds });
    }
    if (cfg.bpmnModel) {
      const c = conformance(log, cfg.bpmnModel);
      if (c.fitness < cfg.fitnessMin) {
        const fitIds = new Set(c.variants.filter((v) => v.fitness === 1).flatMap((v) => v.caseIds));
        add({ kind: "penyimpangan_model", key: "model", measure: c.fitness, threshold: cfg.fitnessMin, higherIsWorse: false, unit: "fitness",
          title: `Penyimpangan dari model BPMN ${cfg.bpmnModel.name}: fitness ${fmt(c.fitness, 2)}`,
          affectedCases: c.cases - c.fitCases, populationCases: c.cases, caseSource: "log_event",
          supportingCaseIds: c.variants.flatMap((v) => v.caseIds).filter((id) => !fitIds.has(id)) });
      }
    }
  }

  for (const ruleKey of new Set(run.ruleVersions.map((r) => r.ruleKey))) {
    const latest = run.ruleVersions.filter((r) => r.ruleKey === ruleKey).reduce((a, b) => (b.version > a.version ? b : a));
    const results = evaluateRun(state, run, ruleKey);
    const s = summarize(results);
    const rate = s.patuh + s.tidakPatuh > 0 ? (s.tidakPatuh / (s.patuh + s.tidakPatuh)) * 100 : null;
    if (rate !== null && rate >= cfg.complianceHighPct) {
      add({ kind: "kepatuhan", key: ruleKey, measure: rate, threshold: cfg.complianceHighPct, higherIsWorse: true, unit: "%",
        title: `${termFor(latest)} aturan ${latest.name}: ${fmt(rate)}% kasus tidak patuh`,
        affectedCases: s.tidakPatuh, populationCases: s.total, ruleVersionId: latest.id, caseSource: "kasus",
        supportingCaseIds: results.filter((r) => r.status === "tidak_patuh").map((r) => r.caseId) });
    }
  }

  const bl = backlog(state, run);
  const cases = runCases(state, run);
  if (!bl.unknown && bl.aged > 0) {
    add({ kind: "backlog", key: "backlog", measure: bl.aged, threshold: 0, higherIsWorse: true, unit: "kasus",
      title: `Backlog menua: ${bl.aged} kasus terbuka lebih dari ${cfg.backlogAgeDays} hari`,
      affectedCases: bl.aged, populationCases: cases.length, caseSource: "kasus", supportingCaseIds: bl.caseIds.slice(0, bl.aged) });
  }

  const months = trend(cases, "bulan", cfg.smallSampleCases).filter((m) => !m.small);
  const first = months[0], last = months[months.length - 1];
  if (first && last && first !== last && first.medianDays !== null && last.medianDays !== null && first.medianDays > 0) {
    const pct = ((last.medianDays - first.medianDays) / first.medianDays) * 100;
    if (pct > cfg.changePct) {
      add({ kind: "tren_memburuk", key: "durasi", measure: last.medianDays, threshold: first.medianDays * (1 + cfg.changePct / 100), higherIsWorse: true, unit: "hari",
        title: `Tren memburuk: median durasi kasus naik ${fmt(pct)}% dari ${first.bucket} ke ${last.bucket}`,
        affectedCases: last.started, populationCases: cases.length, caseSource: "kasus", supportingCaseIds: [] });
    }
  }
  memo.set(run, out);
  return out;
}

export function baselineFor(state: MockState, run: MonitoringRun): MonitoringRun | null {
  const prev = state.runs.filter((r) => r.projectId === run.projectId && r.sourceId === run.sourceId && r.periodTo < run.periodFrom);
  return prev.reduce<MonitoringRun | null>((best, r) => (!best || r.periodTo > best.periodTo || (r.periodTo === best.periodTo && r.createdAt > best.createdAt) ? r : best), null);
}

export interface FindingChange { finding: Finding; status: ChangeStatus; baselineMeasure: number | null; smallSample: boolean }

const STATUS_ORDER: ChangeStatus[] = ["memburuk", "baru", "stabil", "membaik", "tidak_lagi_terdeteksi"];
const SEVERITY_ORDER: Severity[] = ["tinggi", "sedang", "rendah"];

export function compareFindings(current: Finding[], baseline: Finding[] | null, config: MonitoringConfig): FindingChange[] {
  const base = new Map((baseline ?? []).map((f) => [`${f.kind}:${f.key}`, f]));
  const out: FindingChange[] = current.map((f) => {
    const b = base.get(`${f.kind}:${f.key}`);
    if (!b) return { finding: f, status: "baru", baselineMeasure: null, smallSample: false };
    base.delete(`${f.kind}:${f.key}`);
    if (f.populationCases < config.minCasesChange || b.populationCases < config.minCasesChange) return { finding: f, status: "stabil", baselineMeasure: b.measure, smallSample: true };
    const rel = b.measure === 0 ? (f.measure > 0 ? Infinity : 0) : ((f.measure - b.measure) / Math.abs(b.measure)) * 100;
    const worse = f.higherIsWorse ? rel : -rel;
    const status: ChangeStatus = worse > config.changePct ? "memburuk" : worse < -config.changePct ? "membaik" : "stabil";
    return { finding: f, status, baselineMeasure: b.measure, smallSample: false };
  });
  for (const b of base.values()) out.push({ finding: b, status: "tidak_lagi_terdeteksi", baselineMeasure: b.measure, smallSample: false });
  return out.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    || SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity));
}
