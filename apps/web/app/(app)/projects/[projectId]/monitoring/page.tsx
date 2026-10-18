"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Pulse } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { MetricInfo } from "@/components/project/metric-info";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { PerformanceTrend } from "@/components/project/performance-trend";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { reworkStats, runLog } from "@/lib/mock/bottleneck";
import { evaluateRun, summarize } from "@/lib/mock/compliance";
import { backlog, metricDef, runCases, summaryCards, trend } from "@/lib/mock/metrics";
import type { MonitoringRun } from "@/lib/mock/types";

export default function MonitoringSummaryPage() {
  return <Suspense><SummaryContent /></Suspense>;
}

const nf = new Intl.NumberFormat("id-ID");
const days = (d: number | null) => (d === null ? "—" : `${nf.format(d)} hari`);

function SummaryContent() {
  const ctx = useProject();
  const { run } = useSelectedRun();
  if (!ctx) return null;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring" />
      <RunPicker />
      {run ? <Dashboard run={run} /> : (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Pulse size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada run monitoring</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ id, value, note, children }: { id: string; value: string; note: string; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-sm text-ink-2">{metricDef(id).name}<MetricInfo id={id} /></div>
      <p className="text-xl font-semibold text-ink">{value}</p>
      {children}
      <p className="text-xs text-ink-3">{note}</p>
    </Card>
  );
}

function Dashboard({ run }: { run: MonitoringRun }) {
  const ctx = useProject()!;
  const { project, state } = ctx;
  const base = `/projects/${project.id}`;
  const [grain, setGrain] = useState<"bulan" | "minggu">("bulan");
  const { snapshots, mappings } = state;
  const d = useMemo(() => {
    const cards = summaryCards(state, run);
    const log = runLog(state, run);
    const top = new Map<string, MonitoringRun["ruleVersions"][number]>();
    for (const v of run.ruleVersions) if ((top.get(v.ruleKey)?.version ?? 0) < v.version) top.set(v.ruleKey, v);
    return {
      cards, cases: runCases(state, run), rework: log && reworkStats(log, run.config), backlog: backlog(state, run),
      rules: [...top.values()].map((v) => ({ v, s: summarize(evaluateRun(state, run, v.ruleKey)) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics read only snapshots and mappings from state
  }, [run, snapshots, mappings]);
  const { cards, rework, backlog: bl } = d;
  const period = `periode ${run.periodFrom}–${run.periodTo}`;
  const done = `Dihitung dari ${nf.format(cards.finished)} kasus selesai, ${Math.round(cards.coveragePct)}% dari total · ${period}`;
  const all = `Dihitung dari semua kasus dimulai · ${period}`;
  const points = useMemo(() => trend(d.cases, grain, run.config.smallSampleCases), [d.cases, grain, run.config.smallSampleCases]);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat id="kasus_dimulai" value={nf.format(cards.started)} note={all} />
        <Stat id="kasus_selesai" value={nf.format(cards.finished)} note={all} />
        <Stat id="kasus_terbuka" value={nf.format(cards.open)} note={all} />
        <Stat id="durasi_median" value={days(cards.medianDays)} note={done} />
        <Stat id="durasi_p90" value={days(cards.p90Days)} note={done} />
        <Stat id="persen_rework" value={!rework ? "Belum ditetapkan" : `${nf.format(Math.round(rework.anyPct * 10) / 10)}%`}
          note={rework ? `Dari ${nf.format(rework.cases)} kasus di log event` : "Definisi rework belum diatur"}>
          {!rework && <Link href={`${base}/monitoring/settings`} className="text-xs font-medium text-accent hover:underline">Atur di Ambang</Link>}
        </Stat>
        <Card className="flex flex-col gap-2 p-4 sm:col-span-2 xl:col-span-3">
          <div className="flex items-center gap-1.5 text-sm text-ink-2">{metricDef("persen_kepatuhan").name}<MetricInfo id="persen_kepatuhan" /> per aturan</div>
          {d.rules.length === 0 ? <p className="text-sm text-ink-3">Tidak ada aturan pada run ini</p> : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {d.rules.map(({ v, s }) => {
                const ev = s.patuh + s.tidakPatuh;
                return (
                  <li key={v.ruleKey} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`${base}/monitoring/compliance/${v.ruleKey}?run=${run.id}`} title={v.name} className="truncate text-ink hover:underline">{v.name}</Link>
                    <span className="whitespace-nowrap font-medium text-ink">{ev ? `${nf.format(Math.round((s.patuh / ev) * 100))}% patuh` : "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-ink-3">Dihitung dari kasus yang dapat dievaluasi · {period}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Tren kinerja</h2>
          <div role="group" aria-label="Rentang tren" className="flex gap-1">
            {([["bulan", "Bulanan"], ["minggu", "Mingguan"]] as const).map(([g, label]) => (
              <button key={g} type="button" aria-pressed={grain === g} onClick={() => setGrain(g)}
                className={`h-8 rounded-lg border px-3 text-sm ${grain === g ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-ink-2"}`}>{label}</button>
            ))}
          </div>
        </div>
        {points.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">Tidak ada kasus pada periode run</p> : <PerformanceTrend data={points} smallSample={run.config.smallSampleCases} />}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold text-ink">Backlog</h2>
        {bl.unknown ? (
          <p className="text-sm text-ink-2">Status penyelesaian tidak diketahui. <Link href={`${base}/settings`} className="font-medium text-accent hover:underline">Atur aktivitas akhir di Pengaturan proyek</Link></p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm text-ink">
              <span className="text-xl font-semibold">{nf.format(bl.open)}</span> kasus terbuka<MetricInfo id="umur_terbuka" />
              <span className="text-ink-3">· {nf.format(bl.aged)} berumur &gt; {run.config.backlogAgeDays} hari</span>
            </p>
            <p className="text-xs text-ink-3">Umur dihitung terhadap event terakhir dataset: {bl.reference}</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Table aria-label="Kelompok umur kasus terbuka" size="sm">
                <Table.Header><Table.Head id="b" isRowHeader label="UMUR" className="w-full" /><Table.Head id="c" label="KASUS" /></Table.Header>
                <Table.Body>
                  {bl.buckets.map((b) => (
                    <Table.Row key={b.label} id={b.label}>
                      <Table.Cell className="px-6 text-sm text-ink">{b.label}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(b.count)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
              <Table aria-label="Aktivitas terakhir kasus terbuka" size="sm">
                <Table.Header><Table.Head id="a" isRowHeader label="AKTIVITAS TERAKHIR" className="w-full" /><Table.Head id="c" label="KASUS" /></Table.Header>
                <Table.Body>
                  {bl.lastActivities.map((a) => (
                    <Table.Row key={a.activity} id={a.activity}>
                      <Table.Cell className="max-w-[280px] px-6 text-sm text-ink"><span title={a.activity} className="block truncate">{a.activity}</span></Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(a.count)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
