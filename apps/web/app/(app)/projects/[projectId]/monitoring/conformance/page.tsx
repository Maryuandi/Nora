"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Pulse } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { MetricInfo } from "@/components/project/metric-info";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { runLog } from "@/lib/mock/bottleneck";
import { conformance } from "@/lib/mock/replay";
import type { MonitoringRun } from "@/lib/mock/types";

export default function ConformancePage() {
  return <Suspense><Content /></Suspense>;
}

const nf = new Intl.NumberFormat("id-ID");
const fit2 = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const base = `/projects/${ctx.project.id}`;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/conformance" />
      <RunPicker />
      {!run ? <Empty text="Belum ada run monitoring" /> : !run.config.bpmnModel ? (
        <Card className="flex flex-col items-start gap-1 p-4">
          <p className="text-sm font-medium text-ink">Kesesuaian alur hanya dinilai melalui aturan terstruktur</p>
          <Link href={`${base}/monitoring/compliance?run=${run.id}`} className="text-sm font-medium text-accent hover:underline">Buka tab Kepatuhan</Link>
        </Card>
      ) : <Body run={run} model={run.config.bpmnModel} />}
    </div>
  );
}

function Body({ run, model }: { run: MonitoringRun; model: NonNullable<MonitoringRun["config"]["bpmnModel"]> }) {
  const { project, state } = useProject()!;
  const { snapshots, mappings } = state;
  const c = useMemo(() => {
    const log = runLog(state, run);
    return log && conformance(log, model);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads only snapshots and mappings from state
  }, [run, model, snapshots, mappings]);
  if (!c) return <Empty text="Log event belum tersedia untuk run ini" />;
  const deviant = [...c.activities.map((a) => a.activity), ...c.unknownActivities.map((a) => a.activity)];
  const mapHref = `/projects/${project.id}/analysis/map?highlight=${encodeURIComponent(deviant.join(","))}`;

  return (
    <>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-xs text-ink-3">Model BPMN tiruan (konversi BPMN M04 belum tersedia)</p>
        <h2 className="text-base font-semibold text-ink" title={model.name}>{model.name}</h2>
        <ol className="flex flex-wrap items-center gap-1.5 text-sm">
          {model.activities.map((a, i) => (
            <li key={`${i}-${a}`} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight size={14} className="text-ink-3" aria-hidden />}
              <span title={a} className="max-w-[200px] truncate rounded-lg border border-line bg-white px-2 py-0.5 text-ink">{a}</span>
            </li>
          ))}
        </ol>
      </Card>

      {c.cases === 0 ? <Empty text="Tidak ada kasus pada periode run" /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-1.5 text-sm text-ink-2">Fitness keseluruhan<MetricInfo id="fitness" /></div>
              <p className="text-xl font-semibold text-ink">{fit2(c.fitness)}</p>
              <p className="text-xs text-ink-3">Replay token dijalankan per varian unik, dibobot jumlah kasus</p>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <div className="text-sm text-ink-2">Kasus sesuai model</div>
              <p className="text-xl font-semibold text-ink">{nf.format(c.fitCases)} / {nf.format(c.cases)}</p>
              <p className="text-xs text-ink-3">Dihitung dari semua kasus di log event · periode {run.periodFrom}–{run.periodTo}</p>
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-base font-semibold text-ink">Varian</h2>
            <Table aria-label="Varian alur" size="sm">
              <Table.Header><Table.Head id="v" isRowHeader label="URUTAN AKTIVITAS" className="w-full" /><Table.Head id="c" label="KASUS" /><Table.Head id="f" label="FITNESS" /></Table.Header>
              <Table.Body>
                {c.variants.map((v) => {
                  const full = v.trace.join(" → ");
                  return (
                    <Table.Row key={full} id={full}>
                      <Table.Cell className="max-w-[480px] px-6 text-sm text-ink"><span title={full} className="block truncate">{full}</span></Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(v.cases)}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{fit2(v.fitness)}</Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Aktivitas menyimpang</h2>
              {deviant.length > 0 && <Link href={mapHref} className="text-sm font-medium text-accent hover:underline">Sorot di peta proses</Link>}
            </div>
            {deviant.length === 0 ? <p className="text-sm text-ink-3">Tidak ada aktivitas menyimpang</p> : (
              <>
                <Table aria-label="Aktivitas menyimpang" size="sm">
                  <Table.Header><Table.Head id="a" isRowHeader label="AKTIVITAS" className="w-full" /><Table.Head id="m" label="TOKEN HILANG" /><Table.Head id="r" label="TOKEN TERSISA" /><Table.Head id="c" label="KASUS" /></Table.Header>
                  <Table.Body>
                    {c.activities.map((a) => (
                      <Table.Row key={a.activity} id={a.activity}>
                        <Table.Cell className="max-w-[320px] px-6 text-sm text-ink"><span title={a.activity} className="block truncate">{a.activity}</span></Table.Cell>
                        <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(a.missing)}</Table.Cell>
                        <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(a.remaining)}</Table.Cell>
                        <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(a.cases)}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
                {c.unknownActivities.length > 0 && (
                  <Table aria-label="Aktivitas di luar model" size="sm">
                    <Table.Header><Table.Head id="a" isRowHeader label="AKTIVITAS DI LUAR MODEL" className="w-full" /><Table.Head id="c" label="KASUS" /></Table.Header>
                    <Table.Body>
                      {c.unknownActivities.map((a) => (
                        <Table.Row key={a.activity} id={a.activity}>
                          <Table.Cell className="max-w-[320px] px-6 text-sm text-ink"><span title={a.activity} className="block truncate">{a.activity}</span></Table.Cell>
                          <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(a.cases)}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
