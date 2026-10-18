import type { RunRow } from "@/lib/lite/analysis";
import { formatDateTime, formatInt, formatPct } from "@/lib/lite/format";
import { StatePill } from "../badges";

export function describeFilter(f: RunRow["filterSpec"]): string {
  const parts: string[] = [];
  if (f.period) parts.push(`kasus mulai ${f.period.from ?? "…"} s.d. ${f.period.to ?? "…"}`);
  if (f.attribute) parts.push(`${f.attribute.key} = ${f.attribute.values.join(", ")}`);
  if (f.activityPresent.length) parts.push(`memuat ${f.activityPresent.join(", ")}`);
  if (f.activityAbsent.length) parts.push(`tanpa ${f.activityAbsent.join(", ")}`);
  if (f.completion !== "all") parts.push(f.completion === "complete" ? "kasus selesai" : "kasus belum selesai");
  return parts.join(" · ") || "Tanpa filter";
}

export const runLabel = (r: RunRow, tz: string) => `${formatDateTime(r.createdAt, tz)} · ${r.datasetName} · ${r.contextName} · ${describeFilter(r.filterSpec)}${r.status === "completed" ? "" : ` (${r.status})`}`;

/** Every number below is scoped to this header: dataset version, context package, filter, period, coverage. */
export function RunHeader({ run, timezone }: { run: RunRow; timezone: string }) {
  const c = run.coverage;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-2">
      <span>Dataset <span className="font-medium text-ink">{run.datasetName}</span></span>
      <span>Konteks <span className="font-medium text-ink">{run.contextName}</span></span>
      <span>Filter <span className="font-medium text-ink">{describeFilter(run.filterSpec)}</span></span>
      {c && <span>Periode <span className="font-medium text-ink">{formatDateTime(c.periodStart, timezone)} – {formatDateTime(c.periodEnd, timezone)}</span></span>}
      {c && <span>Cakupan <span className="font-medium text-ink">{formatInt(c.cases)} dari {formatInt(c.datasetCases)} kasus ({formatPct(c.datasetCases ? c.cases / c.datasetCases : 0)})</span>{c.excludedEvents > 0 && ` · ${formatInt(c.excludedEvents)} event dikecualikan`}</span>}
      <span className="text-ink-3">{run.algorithmVersion}</span>
      {!run.datasetIsCurrent && <StatePill tone="warning">Dataset versi baru tersedia</StatePill>}
      {!run.contextIsCurrent && <StatePill tone="warning">Konteks diperbarui</StatePill>}
      {run.projectStatusChanged && <StatePill tone="warning">Status proyek berubah saat proses</StatePill>}
    </div>
  );
}
