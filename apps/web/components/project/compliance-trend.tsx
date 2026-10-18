"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CASE_STATUS_LABEL, type ComplianceSummary } from "@/lib/mock/compliance";

const SERIES = [
  { key: "patuh", color: "var(--color-status-active)" },
  { key: "tidakPatuh", color: "var(--color-status-ended)" },
  { key: "tidakDapat", color: "var(--color-status-suspended)" },
] as const;
const LABEL = { patuh: CASE_STATUS_LABEL.patuh, tidakPatuh: CASE_STATUS_LABEL.tidak_patuh, tidakDapat: CASE_STATUS_LABEL.tidak_dapat_dievaluasi };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });

export function ComplianceTrend({ byMonth }: { byMonth: ComplianceSummary["byMonth"] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={byMonth} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip labelFormatter={(m) => monthLabel(String(m))} cursor={{ fill: "var(--color-sidebar)" }} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} name={LABEL[s.key]} stackId="s" fill={s.color} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
