import { z } from "zod";
import { FilterSpec } from "./analysis.ts";
import { RulePayload, ReworkDefinition } from "./context.ts";

export const MONITORING_ALGORITHM_VERSION = "monitoring-v1";

/** Thresholds are versioned per project; each run stores the exact config it used. */
export const MonitoringConfig = z.object({
  bottleneck: z.object({
    topK: z.number().int().min(1).max(50).default(5),
    minP90Seconds: z.number().nonnegative().default(24 * 3600),
    minSupportCases: z.number().int().min(1).default(10),
  }).default({ topK: 5, minP90Seconds: 24 * 3600, minSupportCases: 10 }),
  rework: z.object({ minCaseShare: z.number().min(0).max(1).default(0.1), minSupportCases: z.number().int().min(1).default(10) }).default({ minCaseShare: 0.1, minSupportCases: 10 }),
  rules: z.object({ minNonCompliantShare: z.number().min(0).max(1).default(0.05), minSupportCases: z.number().int().min(1).default(5) }).default({ minNonCompliantShare: 0.05, minSupportCases: 5 }),
  conformance: z.object({ minFitness: z.number().min(0).max(1).default(0.9), minSupportCases: z.number().int().min(1).default(5) }).default({ minFitness: 0.9, minSupportCases: 5 }),
  backlog: z.object({ minSupportCases: z.number().int().min(1).default(10) }).default({ minSupportCases: 10 }),
  trend: z.object({ minRelativeIncrease: z.number().min(0).default(0.2), minCasesPerWindow: z.number().int().min(1).default(20) }).default({ minRelativeIncrease: 0.2, minCasesPerWindow: 20 }),
  smallSampleCases: z.number().int().min(1).default(100),
});
export type MonitoringConfig = z.infer<typeof MonitoringConfig>;
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = MonitoringConfig.parse({});

export interface MetricDefinition {
  key: string;
  version: number;
  name: string;
  description: string;
  formula: string;
  population: string;
  unit: "cases" | "seconds" | "ratio" | "count";
  implementation: string;
  referenceTest: string;
}

/** The metric registry. Changing a formula means a new version here, never an edit in place. */
export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { key: "cases_started", version: 1, name: "Kasus dimulai", description: "Jumlah kasus dalam populasi analisis.", formula: "count(case) dalam filter", population: "Kasus terfilter dengan minimal satu event yang tidak dikecualikan", unit: "cases", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "cases_completed", version: 1, name: "Kasus selesai", description: "Kasus yang event terakhirnya adalah aktivitas akhir batas proses.", formula: "count(case | last_activity ∈ end_activities)", population: "Kasus terfilter; butuh batas proses", unit: "cases", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "cases_open", version: 1, name: "Kasus terbuka", description: "Kasus yang belum mencapai aktivitas akhir.", formula: "cases_started − cases_completed", population: "Kasus terfilter; butuh batas proses", unit: "cases", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "case_duration_median", version: 1, name: "Median durasi kasus", description: "Median waktu dari event pertama ke event terakhir.", formula: "median(t_last − t_first)", population: "Kasus selesai (atau semua kasus bila batas proses tidak ada)", unit: "seconds", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "case_duration_p90", version: 1, name: "P90 durasi kasus", description: "Persentil ke-90 durasi kasus.", formula: "quantile_cont(t_last − t_first, 0.9)", population: "Sama dengan median durasi kasus", unit: "seconds", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "case_duration_mean", version: 1, name: "Rata-rata durasi kasus", description: "Rata-rata durasi kasus.", formula: "avg(t_last − t_first)", population: "Sama dengan median durasi kasus", unit: "seconds", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "transition_wait", version: 1, name: "Tunggu transisi", description: "Selisih waktu selesai antara dua event berurutan dalam satu kasus.", formula: "t_selesai(b) − t_selesai(a) untuk pasangan langsung a→b; median, P90, total", population: "Pasangan event berurutan pada kasus terfilter", unit: "seconds", implementation: "analysis.py:steps", referenceTest: "test_analysis.py::test_edges_counts_and_waits" },
  { key: "service_time", version: 1, name: "Service time aktivitas", description: "Waktu kerja aktivitas bila waktu mulai tersedia.", formula: "median(t_selesai − t_mulai)", population: "Event dengan waktu mulai", unit: "seconds", implementation: "analysis.py:nodes", referenceTest: "test_analysis.py" },
  { key: "rework_case_share", version: 1, name: "Porsi kasus rework", description: "Kasus yang cocok dengan definisi rework F03.", formula: "count(case rework) / cases_started", population: "Kasus terfilter; butuh definisi rework", unit: "ratio", implementation: "monitoring.py:rework", referenceTest: "test_monitoring.py::test_rework" },
  { key: "rework_repetitions", version: 1, name: "Rata-rata pengulangan", description: "Rata-rata pengulangan per kasus rework.", formula: "avg(repetitions | case rework)", population: "Kasus rework", unit: "count", implementation: "monitoring.py:rework", referenceTest: "test_monitoring.py::test_rework" },
  { key: "rule_compliance", version: 1, name: "Kepatuhan aturan", description: "Porsi kasus patuh dari kasus yang dapat dievaluasi.", formula: "compliant / (compliant + non_compliant)", population: "Kasus dalam scope aturan aktif; not_evaluable tidak dihitung", unit: "ratio", implementation: "rules.py", referenceTest: "test_context.py" },
  { key: "open_case_age_median", version: 1, name: "Median umur kasus terbuka", description: "Umur kasus terbuka per waktu event terakhir dataset.", formula: "median(t_akhir_dataset − t_first | case terbuka)", population: "Kasus terbuka; butuh batas proses", unit: "seconds", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "data_coverage", version: 1, name: "Cakupan data", description: "Porsi kasus dataset yang masuk populasi analisis.", formula: "cases_started / kasus dataset", population: "Dataset terbit", unit: "ratio", implementation: "monitoring.py:metrics", referenceTest: "test_monitoring.py::test_metrics" },
  { key: "bpmn_fitness", version: 1, name: "Fitness BPMN", description: "Token-based replay PM4Py, rata-rata tertimbang per varian.", formula: "Σ(fitness_varian × kasus) / Σ kasus", population: "Kasus terfilter; butuh BPMN valid dan pemetaan", unit: "ratio", implementation: "monitoring.py:conformance", referenceTest: "test_monitoring.py::test_conformance" },
];

export const MonitoringInput = z.object({
  projectId: z.uuid(),
  analysisRunId: z.uuid(),
  eventsKey: z.string().min(1).max(512),
  artifactPrefix: z.string().min(1).max(512),
  filter: FilterSpec,
  boundary: z.object({ startActivities: z.array(z.string()), endActivities: z.array(z.string()) }).nullable(),
  rework: ReworkDefinition.nullable(),
  rules: z.array(z.object({ id: z.uuid(), key: z.string(), version: z.number().int(), payload: RulePayload })),
  bpmn: z.object({ objectKey: z.string(), modelId: z.uuid(), mappingId: z.uuid(), mappingVersion: z.number().int(), tasks: z.array(z.object({ id: z.string(), name: z.string() })), mapping: z.record(z.string(), z.array(z.string())) }).nullable(),
  bpmnUnavailableReason: z.string().nullable(),
  config: MonitoringConfig,
});
export type MonitoringInput = z.infer<typeof MonitoringInput>;
