import Link from "next/link";
import { ChartBar } from "@phosphor-icons/react/dist/ssr";
import { METRIC_DEFINITIONS } from "@nora/contracts";
import { AutoRefresh } from "@/components/lite/auto-refresh";
import { MetricInfo, SettingsForm, TrendCharts } from "@/components/lite/analysis/dashboard-client";
import { RunBar } from "@/components/lite/analysis/run-bar";
import { RunHeader, runLabel } from "@/components/lite/analysis/run-header";
import { StatePill } from "@/components/lite/badges";
import { DataTable, EmptyState, SectionCard, Td } from "@/components/lite/ui";
import { Banner } from "@/components/nora/banner";
import { loadAnalysisView } from "@/lib/lite/analysis-page";
import { getDashboard, getSettings, listBottlenecks, type MetricView } from "@/lib/lite/dashboard";
import { formatInt, formatPct, formatSeconds } from "@/lib/lite/format";

export const metadata = { title: "Dashboard analisis" };

function value(m: MetricView) {
  if (!m.available || m.value == null) return "–";
  return m.unit === "seconds" ? formatSeconds(m.value) : m.unit === "ratio" ? formatPct(m.value) : m.unit === "count" ? m.value.toLocaleString("id-ID", { maximumFractionDigits: 1 }) : formatInt(m.value);
}

function MetricCard({ m, label }: { m: MetricView | undefined; label: string }) {
  if (!m) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-white px-4 py-3 shadow-card">
      <span className="flex items-center gap-1 text-xs font-medium text-ink-3">{label}<MetricInfo m={m} /></span>
      <span className="text-xl font-semibold tracking-[-0.02em] text-ink">{value(m)}</span>
      {!m.available ? <span className="text-xs text-ink-2">{m.reason}</span> : (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {formatInt(m.population.cases)} kasus{m.population.basis ? ` · ${m.population.basis}` : ""}
          {m.smallSample && <StatePill tone="warning" title="Populasi kurang dari ambang sampel kecil">Sampel kecil</StatePill>}
        </span>
      )}
    </div>
  );
}

const SEV_TONE = { tinggi: "error", sedang: "warning", rendah: "neutral" } as const;

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { projectId } = await params;
  const { run: runParam } = await searchParams;
  const { viewer, project, may, runs, run, map } = await loadAnalysisView(projectId, runParam);
  const base = `/projects/${projectId}`;
  const settings = await getSettings(viewer, projectId);
  const canRun = may("analysis.run") && project.status === "active";
  const bar = (
    <RunBar projectId={projectId} canRun={canRun} selected={run?.id ?? null} runs={runs.map((r) => ({ id: r.id, label: runLabel(r, project.timezone) }))}
      attributeValues={map?.attributeValues ?? {}}
      initial={{ from: run?.filterSpec.period?.from ?? "", to: run?.filterSpec.period?.to ?? "", key: run?.filterSpec.attribute?.key ?? "", values: run?.filterSpec.attribute?.values ?? [] }} />
  );
  if (!run) return <div className="flex flex-col gap-4">{bar}<EmptyState icon={ChartBar} title="Belum ada analisis">Jalankan analisis untuk menghitung metrik dan temuan.</EmptyState></div>;

  const pending = run.status === "queued" || run.status === "running" || run.monitoringStatus === "running" || (run.status === "result_ready" && run.monitoringStatus === "pending");
  const ready = run.monitoringStatus === "completed";
  const d = ready ? await getDashboard(viewer, projectId, run.id) : null;
  const transitions = ready ? await listBottlenecks(viewer, projectId, run.id) : [];
  const M = d?.metrics ?? {};
  const bottlenecks = transitions.filter((t) => t.isBottleneck);
  const cfg = run.monitoringConfig;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={pending} />
      {bar}
      <RunHeader run={run} timezone={project.timezone} />
      {pending && <div className="rounded-lg border border-line bg-white px-5 py-8 text-center text-sm text-ink-2 shadow-card" role="status">Menghitung metrik, bottleneck, rework, dan conformance…</div>}
      {run.status === "failed" && <Banner tone="warning">Analisis gagal: {run.errorMessage}</Banner>}
      {run.monitoringStatus === "failed" && <Banner tone="warning">Peta proses tersedia, tetapi perhitungan dashboard gagal: {run.monitoringError}. Jalankan ulang analisis untuk mencoba lagi.</Banner>}

      {d && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            <MetricCard m={M.cases_started} label="Kasus dimulai" />
            <MetricCard m={M.cases_completed} label="Kasus selesai" />
            <MetricCard m={M.cases_open} label="Kasus terbuka" />
            <MetricCard m={M.case_duration_median} label="Median durasi" />
            <MetricCard m={M.case_duration_p90} label="P90 durasi" />
            <MetricCard m={M.rework_case_share} label="Porsi rework" />
            <MetricCard m={M.rule_compliance} label="Kepatuhan aturan" />
          </div>

          {d.series.length > 0 && <SectionCard title="Tren ringkas"><TrendCharts series={d.series} /></SectionCard>}

          <SectionCard title="Indikasi bottleneck" description="Transisi diurutkan menurut kontribusi total waktu tunggu. Skor membantu pengurutan, bukan diagnosis sebab.">
            {bottlenecks.length === 0 && (
              <p className="mb-3 text-sm text-ink-2">Tidak ada transisi yang memenuhi ambang: top {cfg?.bottleneck.topK}, P90 ≥ {formatSeconds(cfg?.bottleneck.minP90Seconds)}, minimal {cfg?.bottleneck.minSupportCases} kasus. Ini hasil yang sah, bukan kegagalan.</p>
            )}
            <DataTable head={["#", "Transisi", "Kasus", "Median", "P90", "Total tunggu", "Kontribusi", "Skor", ""]}>
              {transitions.slice(0, 10).map((t) => (
                <tr key={`${t.from}→${t.to}`} className={t.isBottleneck ? "" : "text-ink-2"}>
                  <Td className="text-ink-3">{t.rank}</Td>
                  <Td className="font-medium">{t.from} → {t.to}{t.isBottleneck && <span className="ml-2"><StatePill tone="warning">Indikasi</StatePill></span>}</Td>
                  <Td>{formatInt(t.caseCount)} <span className="text-ink-3">({formatPct(t.affectedCaseShare)})</span></Td>
                  <Td>{formatSeconds(t.medianSeconds)}</Td>
                  <Td>{formatSeconds(t.p90Seconds)}</Td>
                  <Td>{formatSeconds(t.totalSeconds)}</Td>
                  <Td>{formatPct(t.contributionShare)}</Td>
                  <Td>{t.severity}</Td>
                  <Td>{t.findingId && <Link className="text-sm font-medium text-accent hover:underline" href={`${base}/findings/${t.findingId}`}>Buka temuan</Link>}</Td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Rework">
              {!d.rework?.available ? (
                <div className="flex flex-col items-start gap-2 text-sm text-ink-2">
                  <p>{d.rework?.reason ?? "Definisi rework tidak tersedia."}</p>
                  <Link href={`${base}/prepare/context`} className="font-medium text-accent hover:underline">Tetapkan definisi rework</Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  <p><span className="text-xl font-semibold">{formatPct(d.rework.caseShare)}</span> kasus ({formatInt(d.rework.caseCount)}) memenuhi definisi rework · rata-rata {d.rework.avgRepetitions?.toLocaleString("id-ID", { maximumFractionDigits: 1 }) ?? "–"} pengulangan</p>
                  <p className="text-ink-2">Median durasi dengan rework {formatSeconds(d.rework.medianWithSeconds)} · tanpa rework {formatSeconds(d.rework.medianWithoutSeconds)}</p>
                  <p className="text-xs text-ink-3">{d.rework.comparisonNote}</p>
                  {d.rework.reason && <p className="text-xs text-status-suspended">{d.rework.reason}</p>}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Conformance BPMN">
              {d.conformance?.status !== "available" ? (
                <p className="text-sm text-ink-2"><StatePill tone="neutral">{d.conformance?.status === "failed" ? "Gagal" : "Tidak tersedia"}</StatePill> <span className="ml-1">{d.conformance?.reason}</span></p>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  <p><span className="text-xl font-semibold">{d.conformance.fitness?.toLocaleString("id-ID", { maximumFractionDigits: 3 })}</span> fitness (token replay, mapping v{d.conformance.mappingVersion})</p>
                  {(d.conformance.mismatches as { kind: string; activity: string; cases: number }[]).slice(0, 5).map((x) => (
                    <p key={x.kind + x.activity} className="text-ink-2">{x.kind === "not_in_model" ? "Aktivitas di luar model" : "Ketidaksesuaian pada"} <span className="font-medium text-ink">{x.activity}</span> · {formatInt(x.cases)} kasus</p>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title={`Temuan run ini (${d.findings.length})`} actions={d.findings.length > 0 && <Link href={`${base}/findings?run=${run.id}`} className="text-sm font-medium text-accent hover:underline">Semua temuan</Link>}>
            {d.findings.length === 0 ? <p className="text-sm text-ink-2">Tidak ada temuan yang memenuhi ambang pada run ini.</p> : (
              <ul className="divide-y divide-line">
                {d.findings.slice(0, 6).map((f) => (
                  <li key={f.id}><Link href={`${base}/findings/${f.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-accent">
                    <StatePill tone={SEV_TONE[f.severityLabel as keyof typeof SEV_TONE] ?? "neutral"}>{f.severityScore}</StatePill>
                    <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                    <span className="text-xs text-ink-3">{formatInt(f.caseCount)} kasus</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </SectionCard>

          <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
            <summary className="cursor-pointer text-sm font-semibold">Advanced: kepatuhan aturan ({d.rules.length})</summary>
            {d.rules.length === 0 ? <p className="mt-2 text-sm text-ink-2">Belum ada aturan aktif.</p> : (
              <div className="mt-3"><DataTable head={["Aturan", "Patuh", "Tidak patuh", "Tidak dapat dievaluasi", "Alasan"]}>
                {d.rules.map((r: any) => (
                  <tr key={r.ruleId}><Td className="font-medium">{r.name} <span className="text-xs text-ink-3">v{r.version}</span></Td><Td>{formatInt(r.compliant)}</Td><Td>{formatInt(r.nonCompliant)}</Td><Td>{formatInt(r.notEvaluable)}</Td>
                    <Td className="text-xs text-ink-2">{r.reasons.map((x: { reason: string; count: number }) => `${x.reason} (${x.count})`).join(" · ")}</Td></tr>
                ))}
              </DataTable></div>
            )}
          </details>
        </>
      )}

      <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: registry metrik</summary>
        <ul className="mt-3 divide-y divide-line text-sm">
          {METRIC_DEFINITIONS.map((m) => (
            <li key={m.key} className="py-2"><span className="font-medium">{m.name}</span> <code className="text-xs text-ink-3">{m.key} v{m.version}</code><p className="text-xs text-ink-2">{m.formula} · {m.population}</p></li>
          ))}
        </ul>
      </details>
      <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: ambang temuan</summary>
        <div className="mt-3"><SettingsForm projectId={projectId} config={settings.config} version={settings.version} readOnly={!may("analysis.settings") || project.status !== "active"} /></div>
      </details>
    </div>
  );
}
