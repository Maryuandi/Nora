"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { trend } from "@/lib/mock/metrics";

type Point = ReturnType<typeof trend>[number];
const nf = new Intl.NumberFormat("id-ID");

function Tip({ active, payload, label }: { active?: boolean; payload?: { payload: Point }[]; label?: string }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-ink">{label}</p>
      <p className="text-ink-2">Dimulai {nf.format(p.started)} · Selesai {nf.format(p.finished)}</p>
      <p className="text-ink-2">Median {p.medianDays === null ? "—" : `${nf.format(p.medianDays)} hari`}</p>
      {p.small && <p className="font-medium text-ink-3">Sampel kecil</p>}
    </div>
  );
}

export function PerformanceTrend({ data, smallSample }: { data: Point[]; smallSample: number }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis yAxisId="n" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
          <YAxis yAxisId="d" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} unit=" h" />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--color-sidebar)" }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="n" dataKey="started" name="Kasus dimulai" fill="var(--color-accent)">
            {data.map((d) => <Cell key={d.bucket} fillOpacity={d.small ? 0.3 : 1} />)}
          </Bar>
          <Bar yAxisId="n" dataKey="finished" name="Kasus selesai" fill="var(--color-status-active)">
            {data.map((d) => <Cell key={d.bucket} fillOpacity={d.small ? 0.3 : 1} />)}
          </Bar>
          <Line yAxisId="d" dataKey="medianDays" name="Median durasi (hari)" stroke="var(--color-ink)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-ink-3">Sampel kecil: &lt; {smallSample} kasus (batang dipudarkan)</p>
    </div>
  );
}
