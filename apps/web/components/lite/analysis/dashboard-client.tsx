"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info } from "@phosphor-icons/react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonitoringConfig } from "@nora/contracts";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatDate, formatInt, formatSeconds } from "@/lib/lite/format";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "../api";

/** Definition popover: formula, version, population, period and coverage behind one number. */
export function MetricInfo({ m }: { m: { name: string; key: string; version: number; formula: string; description: string; definitionPopulation: string; population: { cases: number; periodStart: string | null; periodEnd: string | null; basis: string | null } } }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" aria-expanded={open} aria-label={`Definisi ${m.name}`} onClick={() => setOpen(!open)} className="rounded p-0.5 text-ink-3 hover:text-ink">
        <Info size={14} aria-hidden />
      </button>
      {open && (
        <span role="tooltip" className="absolute top-6 left-0 z-20 w-72 rounded-lg border border-line bg-white p-3 text-left text-xs font-normal text-ink-2 shadow-lg">
          <span className="block font-medium text-ink">{m.name} · {m.key} v{m.version}</span>
          <span className="mt-1 block">{m.description}</span>
          <span className="mt-1 block"><span className="text-ink-3">Rumus:</span> {m.formula}</span>
          <span className="mt-1 block"><span className="text-ink-3">Populasi:</span> {m.population.basis ?? m.definitionPopulation} · {formatInt(m.population.cases)} kasus</span>
          <span className="mt-1 block"><span className="text-ink-3">Periode:</span> {formatDate(m.population.periodStart)} – {formatDate(m.population.periodEnd)}</span>
        </span>
      )}
    </span>
  );
}

const ACCENT = "#2f399f";
const GRID = "#e6e4e1";
const axis = { fontSize: 11, fill: "#7a7773" };

function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: { value: number }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-white px-2 py-1 text-xs shadow-card">
      <p className="text-ink-3">Minggu {formatDate(label)}</p>
      <p className="font-medium text-ink">{format(payload[0]!.value)}</p>
    </div>
  );
}

/** Two single-series charts instead of one dual-axis chart; both read the stored weekly series. */
export function TrendCharts({ series }: { series: { bucket: string; started: number; completed: number | null; medianDurationSeconds: number | null }[] }) {
  const data = series.map((s) => ({ ...s, days: s.medianDurationSeconds == null ? null : s.medianDurationSeconds / 86_400 }));
  const tick = (v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-xs font-medium text-ink-2">Kasus dimulai per minggu</figcaption>
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="bucket" tickFormatter={tick} tick={axis} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgb(47 57 159 / 0.06)" }} content={<ChartTip format={(v) => `${formatInt(v)} kasus`} />} />
                <Bar dataKey="started" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs font-medium text-ink-2">Median durasi kasus per minggu (hari)</figcaption>
          <div className="h-44">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="bucket" tickFormatter={tick} tick={axis} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={16} />
                <YAxis tick={axis} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ stroke: "#c8c5c0" }} content={<ChartTip format={(v) => formatSeconds(v * 86_400)} />} />
                <Line dataKey="days" stroke={ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-2">Tabel data tren</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-ink-3"><tr><th className="py-1 font-medium">Minggu</th><th className="font-medium">Dimulai</th><th className="font-medium">Selesai</th><th className="font-medium">Median durasi</th></tr></thead>
          <tbody className="divide-y divide-line">{series.map((s) => <tr key={s.bucket}><td className="py-1">{formatDate(s.bucket)}</td><td>{s.started}</td><td>{s.completed ?? "–"}</td><td>{formatSeconds(s.medianDurationSeconds)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

const hours = (s: number) => String(Math.round((s / 3600) * 100) / 100);

export function SettingsForm({ projectId, config, version, readOnly }: { projectId: string; config: MonitoringConfig; version: number; readOnly: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(config);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const saveSettings = useMutation(useTRPC().analyses.saveSettings.mutationOptions());
  async function save() {
    setBusy(true);
    const res = await attempt(saveSettings.mutateAsync({ projectId, config: c }));
    setBusy(false);
    setMsg(res.ok ? `Tersimpan sebagai versi ${res.data.version}. Jalankan analisis baru untuk memakainya.` : errorText(res.error));
    if (res.ok) router.refresh();
  }
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">Versi aktif: {version || "bawaan"}. Run lama tetap memakai konfigurasi yang tercatat di run tersebut.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Input label="Bottleneck: top-k" type="number" value={String(c.bottleneck.topK)} onChange={(v) => setC({ ...c, bottleneck: { ...c.bottleneck, topK: num(v) } })} />
        <Input label="Bottleneck: P90 minimum (jam)" type="number" value={hours(c.bottleneck.minP90Seconds)} onChange={(v) => setC({ ...c, bottleneck: { ...c.bottleneck, minP90Seconds: num(v) * 3600 } })} />
        <Input label="Bottleneck: kasus minimum" type="number" value={String(c.bottleneck.minSupportCases)} onChange={(v) => setC({ ...c, bottleneck: { ...c.bottleneck, minSupportCases: num(v) } })} />
        <Input label="Rework: porsi kasus minimum" type="number" value={String(c.rework.minCaseShare)} onChange={(v) => setC({ ...c, rework: { ...c.rework, minCaseShare: num(v) } })} />
        <Input label="Aturan: porsi tidak patuh minimum" type="number" value={String(c.rules.minNonCompliantShare)} onChange={(v) => setC({ ...c, rules: { ...c.rules, minNonCompliantShare: num(v) } })} />
        <Input label="BPMN: fitness minimum" type="number" value={String(c.conformance.minFitness)} onChange={(v) => setC({ ...c, conformance: { ...c.conformance, minFitness: num(v) } })} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <p role="status" className="mr-auto text-sm text-ink-2">{msg}</p>}
        {!readOnly && <Button size="xs" color="primary" isLoading={busy} onClick={save}>Simpan ambang (versi baru)</Button>}
      </div>
    </fieldset>
  );
}
