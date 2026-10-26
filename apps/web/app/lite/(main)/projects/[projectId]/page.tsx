import Link from "next/link";
import { ArrowRight, CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/base/buttons/button";
import { StatePill } from "@/components/lite/badges";
import { StatusButton } from "@/components/lite/status-actions";
import { KeyValue, SectionCard } from "@/components/lite/ui";
import { formatDate, formatDateTime } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { loadReadiness } from "@/lib/lite/readiness";
import type { Readiness, Section } from "@/lib/lite/readiness-core";

export const metadata = { title: "Ringkasan" };

const QUALITY_LABEL: Record<string, string> = { ready: "Siap", ready_with_notes: "Siap dengan catatan", not_ready: "Belum siap" };

function sectionHref(base: string, s: Section) {
  return { sources: `${base}/prepare`, context: `${base}/prepare/context`, analysis: `${base}/analysis`, findings: `${base}/findings` }[s];
}

interface Item {
  label: string;
  done: boolean;
  /** shown instead of done/not-done when the item is optional */
  note?: string;
  detail: React.ReactNode;
  section: Section;
}

function items(r: Readiness): Item[] {
  const f = r.facts;
  return [
    { label: "Sumber data", done: f.sourceCount > 0, detail: f.sourceCount ? `${f.sourceCount} sumber` : "Belum ada sumber", section: "sources" },
    { label: "Snapshot siap dipetakan", done: f.readySnapshotCount > 0, detail: f.readySnapshotCount ? `${f.readySnapshotCount} snapshot` : "Belum ada file yang lolos validasi", section: "sources" },
    {
      label: "Dataset terbit",
      done: !!f.dataset,
      detail: f.dataset ? `${f.dataset.name} · ${QUALITY_LABEL[f.dataset.qualityStatus] ?? f.dataset.qualityStatus} · terbit ${formatDateTime(f.dataset.publishedAt)}` : "Belum ada dataset published",
      section: "sources",
    },
    { label: "Konteks proses aktif", done: !!f.context, detail: f.context ? `${f.context.name} · aktif ${formatDateTime(f.context.activatedAt)}` : "Belum ada context package aktif", section: "context" },
    {
      label: "BPMN",
      done: !!f.context?.conformanceAvailable,
      note: f.context && !f.context.conformanceAvailable ? "Opsional" : undefined,
      detail: f.context?.conformanceAvailable ? "Conformance tersedia" : "Tanpa BPMN valid; analisis tetap berjalan, conformance tidak tersedia",
      section: "context",
    },
    { label: "Analisis", done: !!f.analysis, detail: f.analysis ? `Selesai ${formatDateTime(f.analysis.completedAt)}` : "Belum ada analisis untuk dataset dan konteks aktif", section: "analysis" },
    ...(f.analysis ? [{ label: "Temuan", done: true, detail: `${f.findings.bottleneck} indikasi bottleneck · ${f.findings.rework} rework`, section: "findings" as const }] : []),
  ];
}

export default async function ProjectSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { viewer, project } = await loadPageProject(projectId);
  const readiness = await loadReadiness(viewer, projectId);
  const base = `/lite/projects/${projectId}`;
  const cta = readiness.cta;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <SectionCard title="Langkah berikutnya">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">
              {readiness.errors.length
                ? "Sebagian status tidak dapat dimuat. Status di bawah belum tentu lengkap."
                : project.status === "draft"
                  ? "Proyek baru belum memuat sumber, dataset, konteks, analisis, atau temuan."
                  : "Ikuti langkah ini untuk melanjutkan alur analisis."}
            </p>
            {cta.section === "activate" ? (
              <StatusButton projectId={projectId} to="active" label={cta.label} primary />
            ) : cta.section ? (
              <Button color="primary" size="xs" href={sectionHref(base, cta.section)} iconTrailing={<ArrowRight data-icon="trailing" aria-hidden />}>{cta.label}</Button>
            ) : (
              <span className="text-sm font-medium text-ink-3">{cta.label}</span>
            )}
          </div>
          {readiness.errors.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-lg border border-[#f3d48a] bg-[#fdf6e3] px-3 py-2 text-sm" role="alert">
              {readiness.errors.map((e) => (
                <li key={e.component}>Komponen <span className="font-medium">{e.component}</span> gagal dimuat · ID {e.correlationId.slice(0, 8)}</li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Kesiapan analisis">
          <ul className="divide-y divide-line">
            {items(readiness).map((i) => (
              <li key={i.label}>
                <Link href={sectionHref(base, i.section)} className="group flex items-center gap-3 py-2.5">
                  {i.done ? (
                    <CheckCircle size={18} weight="fill" className="shrink-0 text-status-active" aria-label="Selesai" />
                  ) : i.note ? (
                    <WarningCircle size={18} weight="fill" className="shrink-0 text-status-suspended" aria-label={i.note} />
                  ) : (
                    <Circle size={18} weight="bold" className="shrink-0 text-ink-3" aria-label="Belum" />
                  )}
                  <span className="w-48 shrink-0 text-sm font-medium text-ink group-hover:text-accent">{i.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{i.detail}</span>
                  {i.note && <StatePill tone="neutral">{i.note}</StatePill>}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Proyek">
        <KeyValue
          items={[
            { label: "Klien", value: project.clientName },
            { label: "Proses", value: project.processName },
            { label: "Periode kontrak", value: `${formatDate(project.contractStart)} – ${formatDate(project.contractEnd)}` },
            { label: "Zona waktu", value: project.timezone },
            { label: "Retensi", value: project.retentionPolicy },
            { label: "Aktivitas terakhir", value: formatDateTime(project.lastActivityAt, project.timezone) },
          ]}
        />
        {project.description && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-line text-ink-2">{project.description}</p>}
      </SectionCard>
    </div>
  );
}
