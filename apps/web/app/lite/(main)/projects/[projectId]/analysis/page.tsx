import { FlowArrow } from "@phosphor-icons/react/dist/ssr";
import { AutoRefresh } from "@/components/lite/auto-refresh";
import { MapView } from "@/components/lite/analysis/map-view";
import { RunBar } from "@/components/lite/analysis/run-bar";
import { RunHeader, runLabel } from "@/components/lite/analysis/run-header";
import { EmptyState } from "@/components/lite/ui";
import { Banner } from "@/components/nora/banner";
import { loadAnalysisView } from "@/lib/lite/analysis-page";
import { loadReadiness } from "@/lib/lite/readiness";

export const metadata = { title: "Peta proses" };

export default async function AnalysisMapPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ run?: string }> }) {
  const { projectId } = await params;
  const { run: runParam } = await searchParams;
  const { viewer, project, may, runs, run, map } = await loadAnalysisView(projectId, runParam);
  const readiness = await loadReadiness(viewer, projectId);
  const canRun = may("analysis.run") && project.status === "active" && !!readiness.facts.dataset && !!readiness.facts.context;
  const pending = !!run && (run.status === "queued" || run.status === "running");

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={pending} />
      {(!readiness.facts.dataset || !readiness.facts.context) && (
        <Banner tone="warning">Analisis membutuhkan dataset terbit dan paket konteks aktif. Lengkapi Persiapan terlebih dahulu.</Banner>
      )}
      <RunBar
        projectId={projectId} canRun={canRun} selected={run?.id ?? null}
        runs={runs.map((r) => ({ id: r.id, label: runLabel(r, project.timezone) }))}
        attributeValues={map?.attributeValues ?? {}}
        initial={{ from: run?.filterSpec.period?.from ?? "", to: run?.filterSpec.period?.to ?? "", key: run?.filterSpec.attribute?.key ?? "", values: run?.filterSpec.attribute?.values ?? [] }}
      />
      {!run ? (
        <EmptyState icon={FlowArrow} title="Belum ada analisis">Jalankan analisis untuk membentuk peta proses dari dataset terbit dan paket konteks aktif.</EmptyState>
      ) : (
        <>
          <RunHeader run={run} timezone={project.timezone} />
          {run.warnings.map((w) => <Banner key={w} tone="warning">{w}</Banner>)}
          {pending && <div className="rounded-lg border border-line bg-white px-5 py-8 text-center text-sm text-ink-2 shadow-card" role="status">Analisis sedang berjalan di worker…</div>}
          {run.status === "failed" && <Banner tone="warning">Analisis gagal: {run.errorMessage ?? "kesalahan worker"}. Jalankan ulang analisis untuk mencoba lagi.</Banner>}
          {map && !map.mapAvailable && <EmptyState icon={FlowArrow} title="Peta tidak tersedia">{map.unavailableReason}</EmptyState>}
          {map?.mapAvailable && <MapView projectId={projectId} runId={run.id} datasetId={run.datasetVersionId} map={map} timezone={project.timezone} />}
        </>
      )}
    </div>
  );
}
