import { BpmnPanel } from "@/components/lite/context/bpmn";
import { CatalogPanel } from "@/components/lite/context/catalog";
import { BoundaryForm, CalendarForm, ReworkForm } from "@/components/lite/context/definitions";
import { PackagePanel } from "@/components/lite/context/package";
import { DocumentsPanel, RulesPanel } from "@/components/lite/context/rules";
import { ItemStatus } from "@/components/lite/context/shared";
import { Banner } from "@/components/nora/banner";
import { SectionCard } from "@/components/lite/ui";
import { contextSummary } from "@/lib/lite/context";
import { loadPageProject } from "@/lib/lite/page";

export const metadata = { title: "Konteks proses" };

export default async function ContextPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  const s = await contextSummary(viewer, projectId);
  const readOnly = !(may("context.write") && project.status === "active");
  const labels = s.datasetLabels;
  const one = (k: keyof typeof s.items) => s.items[k][0] ?? null;
  const ready = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "approved");
  const bpmn = s.bpmn.find((m) => m.status === "approved");
  const plan = {
    boundary: one("process_boundary")?.status === "approved" || s.items.process_boundary.some((i) => i.status === "approved"),
    rework: ready(s.items.rework_definition).length > 0,
    calendar: ready(s.items.calendar).length > 0,
    rules: ready(s.items.rule).length,
    bpmn: (!bpmn ? "none" : bpmn.validationStatus === "valid" && bpmn.mapping && Object.keys(bpmn.mapping.mapping).length ? "conformance" : "visual") as "none" | "visual" | "conformance",
    rubric: ready(s.items.rubric).length > 0,
    hypotheses: ready(s.items.hypothesis).length,
    interventions: ready(s.items.intervention).length,
  };

  return (
    <div className="flex flex-col gap-4">
      {!s.datasetName && <Banner tone="warning">Belum ada dataset terbit. Konteks tetap dapat disiapkan; label aktivitas belum dapat dicocokkan.</Banner>}
      {s.datasetName && <p className="text-sm text-ink-2">Label aktivitas diambil dari dataset terbit <span className="font-medium text-ink">{s.datasetName}</span>. Label yang tidak ada di dataset diberi peringatan, tetapi tetap dapat disimpan.</p>}

      <SectionCard title="1 · Batas proses" description="Aktivitas yang menandai awal dan akhir sebuah kasus." actions={<ItemStatus item={one("process_boundary")} />}>
        <BoundaryForm projectId={projectId} item={one("process_boundary")} labels={labels} readOnly={readOnly} />
      </SectionCard>
      <SectionCard title="2 · Definisi rework" description="Aktivitas berulang atau transisi kembali yang dihitung sebagai rework." actions={<ItemStatus item={one("rework_definition")} />}>
        <ReworkForm projectId={projectId} item={one("rework_definition")} labels={labels} readOnly={readOnly} />
      </SectionCard>
      <SectionCard title="3 · Aturan & SLA" description="Aturan memiliki sumber, masa berlaku, dan versi. Atribut yang tidak tersedia ditandai tidak dapat dievaluasi.">
        <RulesPanel projectId={projectId} items={s.items.rule.filter((r) => r.status !== "obsolete")} labels={labels} documents={s.documents} readOnly={readOnly} hasDataset={!!s.datasetName} />
      </SectionCard>
      <details className="rounded-lg border border-line bg-white shadow-card">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-semibold">4 · Kalender kerja <span className="font-normal text-ink-3">(bila dibutuhkan)</span><span className="ml-auto"><ItemStatus item={one("calendar")} /></span></summary>
        <div className="border-t border-line px-5 py-4"><CalendarForm projectId={projectId} item={one("calendar")} timezone={project.timezone} readOnly={readOnly} /></div>
      </details>
      <SectionCard title="5 · BPMN" description="Model ditampilkan read-only. Model yang gagal dikonversi tetap dapat menjadi referensi visual tanpa conformance.">
        <BpmnPanel key={`${s.bpmn[0]?.id ?? "none"}-${s.bpmn[0]?.validationStatus}-${s.bpmn[0]?.mapping?.version ?? 0}`} projectId={projectId} models={s.bpmn} labels={labels} readOnly={readOnly} />
      </SectionCard>
      <SectionCard title="6 · Katalog & rubrik" description="Kandidat rekomendasi dikurasi manusia; model tidak membuat kandidat baru.">
        <CatalogPanel projectId={projectId} hypotheses={s.items.hypothesis.filter((i) => i.status !== "obsolete")} interventions={s.items.intervention.filter((i) => i.status !== "obsolete")} rubrics={s.items.rubric.filter((i) => i.status !== "obsolete")} labels={labels} readOnly={readOnly} />
      </SectionCard>
      <SectionCard title="7 · Aktifkan paket konteks" description="Paket membekukan versi konfigurasi yang Ready. Analisis lama tetap memakai paketnya sendiri.">
        <PackagePanel projectId={projectId} plan={plan} packages={s.packages} readOnly={readOnly} />
      </SectionCard>
      <details className="rounded-lg border border-line bg-white shadow-card">
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold">Advanced: dokumen sumber ({s.documents.length})</summary>
        <div className="border-t border-line px-5 py-4"><DocumentsPanel projectId={projectId} documents={s.documents} readOnly={readOnly} /></div>
      </details>
    </div>
  );
}
