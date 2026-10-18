import Link from "next/link";
import { Suspense } from "react";
import { MetricInfo } from "@/components/lite/analysis/dashboard-client";
import { describeFilter } from "@/components/lite/analysis/run-header";
import { StatePill } from "@/components/lite/badges";
import { AssessmentPanel } from "@/components/lite/findings/assessment-panel";
import { EvidencePanel } from "@/components/lite/findings/evidence-panel";
import { FindingCases } from "@/components/lite/findings/finding-panels";
import { SEV_TONE, TYPE_LABEL } from "@/components/lite/findings/labels";
import { SectionCard } from "@/components/lite/ui";
import { downstreamStatus } from "@/lib/lite/downstream";
import { getFinding, relatedHypotheses } from "@/lib/lite/findings";
import { formatDate, formatInt, formatPct, formatSeconds } from "@/lib/lite/format";
import { loadPageProject, orNotFound } from "@/lib/lite/page";

export const metadata = { title: "Detail temuan" };

type F = Awaited<ReturnType<typeof getFinding>>;

/** Measured values per finding type, each with its unit. */
function observations(f: F): { label: string; value: string }[] {
  const m = f.metrics;
  const s = (v: unknown) => formatSeconds(v as number);
  switch (f.type) {
    case "bottleneck_indication": return [
      { label: "Kasus terdampak", value: `${formatInt(m.caseCount)} (${formatPct(m.affectedCaseShare)})` }, { label: "Kemunculan transisi", value: formatInt(m.occurrences) },
      { label: "Median tunggu", value: s(m.medianSeconds) }, { label: "P90 tunggu", value: s(m.p90Seconds) },
      { label: "Total tunggu", value: s(m.totalSeconds) }, { label: "Kontribusi total tunggu", value: formatPct(m.contributionShare) },
    ];
    case "high_rework": return [
      { label: "Kasus rework", value: `${formatInt(m.caseCount)} (${formatPct(m.caseShare)})` }, { label: "Rata-rata pengulangan", value: (m.avgRepetitions ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 1 }) },
      { label: "Median durasi dengan rework", value: s(m.medianWithSeconds) }, { label: "Median durasi tanpa rework", value: s(m.medianWithoutSeconds) },
    ];
    case "rule_non_compliance": return [
      { label: "Tidak patuh", value: `${formatInt(m.nonCompliant)} (${formatPct(m.nonCompliantShare)})` }, { label: "Patuh", value: formatInt(m.compliant) }, { label: "Tidak dapat dievaluasi", value: formatInt(m.notEvaluable) },
    ];
    case "bpmn_deviation": return [{ label: "Fitness", value: (m.fitness ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 3 }) }, { label: "Kasus tidak sesuai", value: formatInt(m.unfitCases) }, { label: "Varian tidak sesuai", value: formatInt(m.unfitVariants) }];
    case "aging_backlog": return [{ label: "Kasus menua", value: formatInt(m.agedCases) }, { label: "Kasus terbuka", value: formatInt(m.openCases) }, { label: "Ambang umur", value: s(m.ageThresholdSeconds) }];
    default: return [{ label: "Median 4 minggu terakhir", value: s(m.recentMedianSeconds) }, { label: "Median 4 minggu sebelumnya", value: s(m.priorMedianSeconds) }, { label: "Perubahan", value: formatPct(m.relativeChange) }];
  }
}

async function Downstream({ projectId, findingId }: { projectId: string; findingId: string }) {
  const d = await downstreamStatus(projectId, findingId);
  const base = `/lite/projects/${projectId}`;
  return (
    <ul className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs">
      <li>{d.assessments?.total ? <StatePill tone={d.assessments.needsReview ? "warning" : "active"}>{d.assessments.total} penilaian{d.assessments.needsReview ? ` · ${d.assessments.needsReview} perlu review` : ""}</StatePill> : <span className="text-ink-3">Penilaian belum dijalankan</span>}</li>
      <li>{d.recommendations?.total ? <Link className="text-accent hover:underline" href={`${base}/recommendations/${findingId}`}>{d.recommendations.total} kandidat · {d.recommendations.validated} tervalidasi</Link> : <span className="text-ink-3">Rekomendasi belum disusun</span>}</li>
      <li>{d.interpretations?.total ? <StatePill tone="info">Interpretasi {d.interpretations.latestStatus}</StatePill> : <span className="text-ink-3">Interpretasi belum dibuat</span>}</li>
    </ul>
  );
}

export default async function FindingDetailPage({ params }: { params: Promise<{ projectId: string; findingId: string }> }) {
  const { projectId, findingId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  const f = await orNotFound(getFinding(viewer, projectId, findingId));
  const hypotheses = await relatedHypotheses(projectId, f);
  const base = `/lite/projects/${projectId}`;
  const metricDef = { name: f.metricName, key: f.metricKey, version: f.metricVersion, formula: f.formula, description: f.metricDescription, definitionPopulation: f.metricPopulation,
    population: { cases: f.population.cases, periodStart: f.population.periodStart, periodEnd: f.population.periodEnd, basis: null } };
  const cov = f.runCoverage;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/findings?run=${f.analysisRunId}`} className="text-xs text-ink-3 hover:text-accent">Temuan</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{f.title}</h2>
          <StatePill tone="neutral">{TYPE_LABEL[f.type]}</StatePill>
          <StatePill tone={SEV_TONE[f.severityLabel as keyof typeof SEV_TONE] ?? "neutral"}>Severity {f.severityScore} · {f.severityLabel}</StatePill>
          {f.population.smallSample && <StatePill tone="warning">Sampel kecil</StatePill>}
          {!f.datasetIsCurrent && <StatePill tone="warning">Dataset versi baru tersedia</StatePill>}
          {!f.contextIsCurrent && <StatePill tone="warning">Konteks diperbarui</StatePill>}
        </div>
      </div>

      <SectionCard title="Ringkasan" description="Observasi terukur dipisahkan dari hipotesis. Skor membantu pengurutan, bukan diagnosis.">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">Observasi terukur <MetricInfo m={metricDef} /></h3>
            <p className="mb-3 text-sm text-ink-2">{f.summary}</p>
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {observations(f).map((o) => (
                <div key={o.label} className="rounded-lg border border-line px-3 py-2"><dt className="text-xs text-ink-3">{o.label}</dt><dd className="text-base font-semibold">{o.value}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-3">
              Populasi {formatInt(f.population.cases)} kasus · periode {formatDate(f.population.periodStart)} – {formatDate(f.population.periodEnd)}
              {cov && ` · cakupan ${formatInt(cov.cases)} dari ${formatInt(cov.datasetCases)} kasus dataset`} · metrik {f.metricKey} v{f.metricVersion} · filter {describeFilter(f.runFilter as never)}
            </p>
            <p className="mt-1 text-xs text-ink-3">Ambang: {Object.entries(f.thresholds).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</p>
            <p className="mt-2 flex flex-wrap gap-3 text-xs">
              <Link className="text-accent hover:underline" href={`${base}/prepare/datasets/${f.datasetVersionId}`}>Dataset {f.datasetName}</Link>
              <Link className="text-accent hover:underline" href={`${base}/prepare/context`}>Konteks {f.contextName}</Link>
              <Link className="text-accent hover:underline" href={`${base}/analysis?run=${f.analysisRunId}`}>Run analisis</Link>
            </p>
          </div>
          <div className="border-t border-line pt-3">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Hipotesis dari katalog · belum terbukti</h3>
            {hypotheses.length === 0 ? <p className="text-sm text-ink-2">Tidak ada hipotesis katalog yang cocok dengan jenis dan aktivitas temuan ini.</p> : (
              <ul className="flex flex-col gap-1.5">{hypotheses.map((h) => (
                <li key={h.key} className="rounded-md border border-dashed border-status-suspended/60 px-3 py-1.5 text-sm">{h.payload.statement} <span className="text-xs text-ink-3">· {h.key} v{h.version}</span></li>
              ))}</ul>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Kasus pendukung (${formatInt(f.caseCount)})`} description="Jumlah sama dengan kasus yang tercatat pada temuan. Klik kasus untuk timeline dan sumber baris.">
        <FindingCases projectId={projectId} findingId={f.id} datasetId={f.datasetVersionId} type={f.type} timezone={project.timezone} />
      </SectionCard>

      <SectionCard title="Bukti">
        <EvidencePanel projectId={projectId} findingId={f.id} timezone={project.timezone} />
      </SectionCard>
      <SectionCard title="Penilaian & interpretasi" actions={<Suspense fallback={null}><Downstream projectId={projectId} findingId={f.id} /></Suspense>}>
        <AssessmentPanel projectId={projectId} findingId={f.id} canRun={may("assessment.run") && project.status === "active"} canCorrect={may("assessment.correct") && project.status === "active"} />
      </SectionCard>
    </div>
  );
}
