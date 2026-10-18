"use client";

import { Suspense, useMemo, useState } from "react";
import { Pulse } from "@phosphor-icons/react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table } from "@/components/application/table/table";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { compareGroups, comparePeriods, groupAttributes } from "@/lib/mock/metrics";
import type { MonitoringRun } from "@/lib/mock/types";

export default function ComparePage() {
  return <Suspense><CompareContent /></Suspense>;
}

const nf = new Intl.NumberFormat("id-ID");
const COLORS = ["var(--color-accent)", "var(--color-status-active)", "var(--color-status-suspended)", "var(--color-status-ended)"];
const dateInput = "h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink";

function CompareContent() {
  const { run } = useSelectedRun();
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/compare" />
      <RunPicker />
      {run ? <Compare key={run.id} run={run} /> : (
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

// Halves of the run period; the second starts the day after the first ends.
function halves(run: MonitoringRun) {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
  const mid = Math.floor((ms(run.periodFrom) + ms(run.periodTo)) / 2 / 86_400_000) * 86_400_000;
  return { a: { from: run.periodFrom, to: iso(mid) }, b: { from: iso(mid + 86_400_000), to: run.periodTo } };
}

function Compare({ run }: { run: MonitoringRun }) {
  const { state } = useProject()!;
  const [mode, setMode] = useState<"kelompok" | "periode">("kelompok");
  const attrs = groupAttributes(state, run);
  const [attr, setAttr] = useState(attrs[0] ?? "");
  const [pa, setPa] = useState(() => halves(run).a);
  const [pb, setPb] = useState(() => halves(run).b);
  const { snapshots, mappings } = state;
  const groups = useMemo(() => {
    if (mode === "periode") return comparePeriods(state, run, pa, pb).groups;
    return attr ? compareGroups(state, run, attr).groups : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics read only snapshots and mappings from state
  }, [mode, run, attr, pa, pb, snapshots, mappings]);
  const comparable = groups.filter((g) => g.comparable);
  const ref = comparable.find((g) => g.medianDays !== null);
  const bins = groups[0]?.histogram.map((h, i) => ({ bin: h.bin, ...Object.fromEntries(comparable.map((g, j) => [`g${j}`, g.histogram[i].count])) })) ?? [];
  const range = (k: "a" | "b", set: typeof setPa, v: typeof pa) => (
    <span className="flex items-center gap-1">
      <input type="date" aria-label={`Periode ${k === "a" ? "A" : "B"} mulai`} value={v.from} onChange={(e) => set({ ...v, from: e.target.value })} className={dateInput} />–
      <input type="date" aria-label={`Periode ${k === "a" ? "A" : "B"} selesai`} value={v.to} onChange={(e) => set({ ...v, to: e.target.value })} className={dateInput} />
    </span>
  );

  return (
    <>
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div role="radiogroup" aria-label="Mode perbandingan" className="flex gap-4 text-sm text-ink">
          {([["kelompok", "Kelompok"], ["periode", "Periode"]] as const).map(([m, label]) => (
            <label key={m} className="flex items-center gap-1.5"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />{label}</label>
          ))}
        </div>
        {mode === "kelompok" ? (
          attrs.length === 0 ? <p className="text-sm text-ink-3">Belum ada atribut kelompok yang dipetakan (M03)</p> : (
            <label className="flex items-center gap-2 text-sm font-medium text-ink">Atribut
              <select value={attr} onChange={(e) => setAttr(e.target.value)} className="h-8 rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink">
                {attrs.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )
        ) : <div className="flex flex-wrap items-center gap-3 text-sm text-ink">A {range("a", setPa, pa)} B {range("b", setPb, pb)}</div>}
      </Card>

      {groups.length > 0 && (
        <>
          <Card>
            <Table aria-label="Perbandingan" size="sm">
              <Table.Header>
                <Table.Head id="g" isRowHeader label="KELOMPOK" className="w-full" />
                <Table.Head id="n" label="KASUS" />
                <Table.Head id="f" label="SELESAI" />
                <Table.Head id="m" label="MEDIAN (HARI)" />
                <Table.Head id="p" label="P90 (HARI)" />
                <Table.Head id="d" label="SELISIH MEDIAN" />
              </Table.Header>
              <Table.Body>
                {groups.map((g) => {
                  const diff = g.comparable && ref && g !== ref && g.medianDays !== null && ref.medianDays !== null ? g.medianDays - ref.medianDays : null;
                  return (
                    <Table.Row key={g.label} id={g.label}>
                      <Table.Cell className="max-w-[280px] px-6 text-sm font-medium text-ink">
                        <span title={g.label} className="block truncate">{g.label}</span>
                        {!g.comparable && <Pill className="mt-1">Di bawah {nf.format(run.config.minGroupCases)} kasus, tidak dibandingkan</Pill>}
                      </Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(g.cases)}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{nf.format(g.finished)}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{g.medianDays === null ? "—" : nf.format(g.medianDays)}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{g.p90Days === null ? "—" : nf.format(g.p90Days)}</Table.Cell>
                      <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{diff === null ? "—" : `${diff > 0 ? "+" : ""}${nf.format(diff)} hari`}</Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <h2 className="text-base font-semibold text-ink">Histogram durasi (hari)</h2>
            {comparable.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">Tidak ada kelompok yang dapat dibandingkan</p> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="bin" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip cursor={{ fill: "var(--color-sidebar)" }} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  {comparable.map((g, i) => <Bar key={g.label} dataKey={`g${i}`} name={g.label} fill={COLORS[i % COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-ink-3">Perbandingan deskriptif, bukan dampak kausal</p>
          </Card>
        </>
      )}
    </>
  );
}
