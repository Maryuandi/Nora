import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { StatePill } from "@/components/lite/badges";
import { DataTable, EmptyState, SectionCard, Td } from "@/components/lite/ui";
import { DEFAULT_TYPES, FINDING_TYPES, listFindings, type FindingRow } from "@/lib/lite/findings";
import { formatDateTime, formatInt, formatPct, formatSeconds } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { cx } from "@/utils/cx";
import { SEV_TONE, TYPE_LABEL } from "@/components/lite/findings/labels";

export const metadata = { title: "Temuan" };


const SORTS = [["severity", "Severity"], ["contribution", "Kontribusi tunggu"], ["cases", "Kasus terdampak"], ["newest", "Terbaru"]] as const;

function coreMetric(f: FindingRow) {
  const m = f.metrics;
  switch (f.type) {
    case "bottleneck_indication": return `P90 ${formatSeconds(m.p90Seconds)} · ${formatPct(m.contributionShare)} total tunggu`;
    case "high_rework": return `${formatPct(m.caseShare)} kasus · ${(m.avgRepetitions ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })} pengulangan`;
    case "rule_non_compliance": return `${formatPct(m.nonCompliantShare)} tidak patuh`;
    case "bpmn_deviation": return `fitness ${(m.fitness ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 3 })}`;
    case "aging_backlog": return `${formatInt(m.agedCases)} dari ${formatInt(m.openCases)} terbuka`;
    default: return `median ${formatSeconds(m.recentMedianSeconds)} vs ${formatSeconds(m.priorMedianSeconds)}`;
  }
}

export default async function FindingsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ run?: string; type?: string; sort?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { viewer, project } = await loadPageProject(projectId);
  const types = sp.type ? sp.type.split(",") : DEFAULT_TYPES;
  const { runId, findings, totals } = await listFindings(viewer, projectId, { runId: sp.run, types, sort: sp.sort });
  const base = `/lite/projects/${projectId}`;
  const link = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ run: runId ?? undefined, type: sp.type, sort: sp.sort, ...over }).filter(([, v]) => v) as [string, string][]);
    return `${base}/findings?${q}`;
  };
  const toggled = (t: string) => (types.includes(t) ? types.filter((x) => x !== t) : [...types, t]).join(",");

  if (!runId) {
    return <EmptyState icon={MagnifyingGlass} title="Belum ada temuan">Temuan muncul setelah analisis selesai. <Link className="text-accent hover:underline" href={`${base}/analysis`}>Buka Analisis</Link></EmptyState>;
  }
  return (
    <SectionCard
      title="Temuan"
      description="Indikasi terukur dari satu run analisis. Temuan tidak menyatakan sebab."
      actions={<Link className="text-sm font-medium text-accent hover:underline" href={`${base}/analysis/dashboard?run=${runId}`}>Dashboard run ini</Link>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {FINDING_TYPES.slice(0, 2).map((t) => (
          <Link key={t} href={link({ type: toggled(t) })} aria-pressed={types.includes(t)} className={cx("rounded-full border px-3 py-1", types.includes(t) ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-2")}>
            {TYPE_LABEL[t]} ({totals[t] ?? 0})
          </Link>
        ))}
        <details className="relative">
          <summary className="cursor-pointer rounded-full border border-line px-3 py-1 text-ink-2">Jenis lain</summary>
          <div className="absolute z-10 mt-1 flex w-56 flex-col gap-1 rounded-lg border border-line bg-white p-2 shadow-lg">
            {FINDING_TYPES.slice(2).map((t) => (
              <Link key={t} href={link({ type: toggled(t) })} className={cx("rounded px-2 py-1", types.includes(t) ? "bg-accent-soft text-accent" : "hover:bg-canvas")}>{TYPE_LABEL[t]} ({totals[t] ?? 0})</Link>
            ))}
          </div>
        </details>
        <span className="ml-auto text-xs text-ink-3">Urutkan:</span>
        {SORTS.map(([k, label]) => (
          <Link key={k} href={link({ sort: k })} className={cx("text-xs", (sp.sort ?? "severity") === k ? "font-semibold text-accent" : "text-ink-2 hover:text-ink")}>{label}</Link>
        ))}
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-ink-2">Tidak ada temuan dengan jenis ini pada run tersebut. Hasil analisis tetap valid; lihat dashboard untuk ambang yang dipakai.</p>
      ) : (
        <DataTable head={["Jenis", "Temuan", "Metrik inti", "Populasi", "Severity", "Run"]}>
          {findings.map((f) => (
            <tr key={f.id}>
              <Td><StatePill tone="neutral">{TYPE_LABEL[f.type]}</StatePill></Td>
              <Td><Link href={`${base}/findings/${f.id}`} className="font-medium text-ink hover:text-accent">{f.title}</Link><div className="text-xs text-ink-3">{formatInt(f.caseCount)} kasus pendukung</div></Td>
              <Td className="text-ink-2">{coreMetric(f)}</Td>
              <Td className="text-ink-2">{formatInt(f.population.cases)} kasus{f.population.smallSample && <span className="ml-1"><StatePill tone="warning">Sampel kecil</StatePill></span>}</Td>
              <Td><StatePill tone={SEV_TONE[f.severityLabel as keyof typeof SEV_TONE] ?? "neutral"}>{f.severityScore} · {f.severityLabel}</StatePill></Td>
              <Td className="text-xs text-ink-2">{formatDateTime(f.runCreatedAt, project.timezone)}{!f.datasetIsCurrent && <div className="text-status-suspended">dataset baru tersedia</div>}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </SectionCard>
  );
}
