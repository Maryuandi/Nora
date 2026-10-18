"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Pulse } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { MetricInfo } from "@/components/project/metric-info";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { formatDuration } from "@/lib/format";
import { bottlenecks, reworkStats, runLog, transitionCases } from "@/lib/mock/bottleneck";
import type { MonitoringRun } from "@/lib/mock/types";

export default function BottleneckPage() {
  return <Suspense><Content /></Suspense>;
}

const nf = new Intl.NumberFormat("id-ID");
const pct1 = (n: number) => `${nf.format(Math.round(n * 10) / 10)}%`;
const dur = (ms: number | null) => (ms === null ? "—" : formatDuration(ms));

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Pulse size={28} className="text-ink-3" aria-hidden />
        <p className="text-sm font-medium">{text}</p>
      </div>
    </Card>
  );
}

function Content() {
  const ctx = useProject();
  const { run } = useSelectedRun();
  if (!ctx) return null;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/bottleneck" />
      <RunPicker />
      {run ? <Body run={run} /> : <Empty text="Belum ada run monitoring" />}
    </div>
  );
}

function Body({ run }: { run: MonitoringRun }) {
  const { project, state } = useProject()!;
  const base = `/projects/${project.id}`;
  const [sel, setSel] = useState<string | null>(null);
  const { snapshots, mappings } = state;
  const d = useMemo(() => {
    const log = runLog(state, run);
    return log && { log, bn: bottlenecks(log, run.config), rework: reworkStats(log, run.config) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only snapshots and mappings from state
  }, [run, snapshots, mappings]);
  if (!d) return <Empty text="Log event belum tersedia untuk run ini" />;
  const { log, bn, rework } = d;
  const mapping = mappings.find((m) => m.id === run.mappingId);
  const noStart = !Object.values(mapping?.roles ?? {}).includes("timestamp_start");
  const t = bn.transitions.find((x) => x.id === sel);
  const rows = t ? transitionCases(log, t.from, t.to).slice(0, 50) : [];
  const period = `periode ${run.periodFrom}–${run.periodTo}`;

  return (
    <>
      <p className="text-xs text-ink-3">Dihitung dari {nf.format(bn.cases)} kasus di log event · {period}</p>
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold text-ink">Transisi dengan jeda terpanjang</h2>
        {noStart && <p className="text-xs text-ink-3">Waktu kerja per aktivitas tidak tersedia: waktu mulai tidak dipetakan</p>}
        {bn.transitions.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">Tidak ada transisi pada periode run</p> : (
          <Table aria-label="Transisi antar aktivitas" size="sm" selectionMode="single" selectedKeys={sel ? [sel] : []}
            onSelectionChange={(k) => setSel(k === "all" ? null : ([...k][0] as string | undefined) ?? null)}>
            <Table.Header>
              <Table.Head id="t" isRowHeader label="TRANSISI" className="w-full" />
              <Table.Head id="f" label="FREKUENSI" /><Table.Head id="c" label="KASUS" />
              <Table.Head id="m" label="MEDIAN" /><Table.Head id="p" label="P90" /><Table.Head id="j" label="TOTAL JEDA" />
              <Table.Head id="s" label="% KONTRIBUSI" />
            </Table.Header>
            <Table.Body>
              {bn.transitions.map((x) => (
                <Table.Row key={x.id} id={x.id}>
                  <Table.Cell className="max-w-[320px] px-6 text-sm text-ink">
                    <span title={`${x.from} → ${x.to}`} className="block truncate">{x.from} → {x.to}</span>
                    {x.indicated && <Pill dot="bg-status-suspended" className="mt-1">Indikasi bottleneck</Pill>}
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(x.count)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(x.caseCount)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{dur(x.medianMs)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{dur(x.p90Ms)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{dur(x.totalMs)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, x.sharePct)}%` }} /></div>
                      {pct1(x.sharePct)}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
        <p className="flex items-center gap-1.5 text-xs text-ink-3">Indikasi berdasarkan kontribusi waktu tunggu; tidak menunjukkan penyebab.<MetricInfo id="kontribusi_tunggu" /></p>
      </Card>

      {t && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink" title={`${t.from} → ${t.to}`}>Kasus pendukung: {t.from} → {t.to}</h3>
            <Link href={`${base}/analysis/map`} className="text-sm font-medium text-accent hover:underline">Lihat di peta proses</Link>
          </div>
          <p className="text-xs text-ink-3">Menampilkan {nf.format(rows.length)} dari {nf.format(t.caseCount)} kasus, jeda terpanjang lebih dulu</p>
          <Table aria-label="Kasus pendukung" size="sm">
            <Table.Header><Table.Head id="i" isRowHeader label="ID KASUS" className="w-full" /><Table.Head id="g" label="JEDA" /></Table.Header>
            <Table.Body>
              {rows.map((r) => (
                <Table.Row key={r.caseId} id={r.caseId}>
                  <Table.Cell className="px-6 text-sm text-ink"><span title={r.caseId} className="block max-w-[320px] truncate">{r.caseId}</span></Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2">{dur(r.gapMs)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink">Rework<MetricInfo id="persen_rework" /></h2>
        {!rework ? (
          <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-line p-4">
            <p className="text-sm font-medium text-ink">Definisi rework belum ditetapkan</p>
            <Link href={`${base}/monitoring/settings`} className="text-sm font-medium text-accent hover:underline">Atur di pengaturan monitoring</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink">{pct1(rework.anyPct)} kasus memiliki rework <span className="text-ink-3">· dari {nf.format(rework.cases)} kasus di log event</span></p>
            <Table aria-label="Rework per aktivitas" size="sm">
              <Table.Header>
                <Table.Head id="a" isRowHeader label="AKTIVITAS" className="w-full" /><Table.Head id="p" label="% KASUS" />
                <Table.Head id="r" label="RATA-RATA PENGULANGAN" /><Table.Head id="w" label="MEDIAN DENGAN" />
                <Table.Head id="o" label="MEDIAN TANPA" /><Table.Head id="d" label="SELISIH" />
              </Table.Header>
              <Table.Body>
                {rework.activities.map((a) => (
                  <Table.Row key={a.activity} id={a.activity}>
                    <Table.Cell className="max-w-[280px] px-6 text-sm text-ink"><span title={a.activity} className="block truncate">{a.activity}</span></Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{pct1(a.pct)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(Math.round(a.avgRepeats * 10) / 10)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{dur(a.medianWithMs)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{dur(a.medianWithoutMs)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{dur(a.diffMs)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            <p className="text-xs text-ink-3">Perbandingan deskriptif, bukan dampak kausal</p>
          </>
        )}
        <p className="text-xs text-ink-3">Definisi rework sementara di pengaturan monitoring (pindah ke paket konteks M04f)</p>
      </Card>
    </>
  );
}
