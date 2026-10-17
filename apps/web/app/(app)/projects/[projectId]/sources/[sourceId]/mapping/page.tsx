"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { STATUS_META } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { MappingForm, type MappingDraft } from "@/components/project/mapping-form";
import { SourceTabs } from "@/components/project/source-tabs";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { latestMapping, snapshotsForSource } from "@/lib/mock/reducer";

export default function MappingPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const ctx = useProject();
  const router = useRouter();
  const source = ctx?.state.sources.find((s) => s.id === sourceId);
  if (!ctx || !source || source.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, state, can, run } = ctx;
  const base = `/projects/${project.id}/sources/${source.id}`;
  const snap = snapshotsForSource(state, source.id).find((s) => s.status === "siap_dipetakan");
  const template = latestMapping(state, source.id);
  const mayEdit = can("mapping.edit", project.id);
  const open = acceptsData(project.status);

  function save(draft: MappingDraft) {
    // Same numbering as the reducer: highest existing version of this source + 1.
    const version = Math.max(0, ...state.mappings.filter((m) => m.sourceId === source!.id).map((m) => m.version)) + 1;
    const r = run({ type: "saveMapping", sourceId: source!.id, snapshotId: snap!.id, ...draft });
    if (r.error) return r.error;
    router.push(`${base}/mapping/versions?saved=${version}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${project.id}/sources`} className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Sumber data
      </Link>
      <div className="min-w-0">
        <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={source.name}>{source.name}</h2>
        <p className="mt-1 text-sm text-ink-3">
          {snap ? <>Pemetaan untuk snapshot <span title={snap.fileName}>{snap.fileName}</span>. {template ? `Dasar: versi v${template.version}.` : "Belum ada pemetaan sebelumnya."}</> : "Pemetaan kolom, waktu, dan label aktivitas."}
        </p>
      </div>
      <SourceTabs base={base} active="/mapping" />

      {mayEdit && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penyimpanan pemetaan dinonaktifkan</p>}
      {!mayEdit && <p className="text-sm text-ink-3">Peranmu hanya dapat melihat pemetaan.</p>}

      {!snap ? (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Belum ada snapshot yang siap dipetakan</p>
          <p className="mt-1 text-sm text-ink-3">Unggah dan validasi file terlebih dahulu.</p>
          <Link href={base} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Kembali ke sumber data</Link>
        </div>
      ) : (
        <MappingForm key={`${snap.id}:${template?.id ?? ""}`} snapshot={snap} initial={template} readOnly={!(mayEdit && open)} onSave={save} />
      )}
    </div>
  );
}
