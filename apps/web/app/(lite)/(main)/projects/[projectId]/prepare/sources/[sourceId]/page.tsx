import Link from "next/link";
import { AutoRefresh } from "@/components/lite/auto-refresh";
import { MappingEditor } from "@/components/lite/prepare/mapping-editor";
import { SnapshotReviewActions } from "@/components/lite/prepare/snapshot-actions";
import { DatasetStatus, SnapshotStatus } from "@/components/lite/prepare/status";
import { UploadPanel } from "@/components/lite/prepare/upload-panel";
import { Stepper, type StepState } from "@/components/lite/stepper";
import { KeyValue, SectionCard } from "@/components/lite/ui";
import { getSnapshot, getSource, listDatasets, listMappings, listSnapshots } from "@/lib/lite/data";
import { formatBytes, formatDateTime, formatInt } from "@/lib/lite/format";
import { loadPageProject, orNotFound } from "@/lib/lite/page";

export const metadata = { title: "Sumber data" };

const DELIM: Record<string, string> = { ",": "koma", ";": "titik koma", "\t": "tab", "|": "pipa" };

export default async function SourcePage({ params, searchParams }: { params: Promise<{ projectId: string; sourceId: string }>; searchParams: Promise<{ snapshot?: string; mapping?: string }> }) {
  const { projectId, sourceId } = await params;
  const sp = await searchParams;
  const { viewer, project, may } = await loadPageProject(projectId);
  const source = await orNotFound(getSource(viewer, projectId, sourceId));
  const [snapshots, mappings, datasets] = await Promise.all([listSnapshots(viewer, projectId, sourceId), listMappings(viewer, projectId, sourceId), listDatasets(viewer, projectId)]);
  const selectedId = sp.snapshot && snapshots.some((s) => s.id === sp.snapshot) ? sp.snapshot : snapshots.find((s) => s.status !== "cancelled")?.id;
  const snap = selectedId ? await getSnapshot(viewer, projectId, selectedId) : null;
  const mapping = (sp.mapping && mappings.find((m) => m.id === sp.mapping)) || mappings[0] || null;
  const sourceDatasets = datasets.filter((d) => d.sourceId === sourceId);
  const canWrite = may("data.write") && project.status === "active";
  const base = `/projects/${projectId}/prepare`;
  const pending = !!snap && (snap.status === "validating" || snap.status === "awaiting_upload");

  const ready = snap?.status === "ready_for_mapping";
  const steps: { label: string; state: StepState }[] = [
    { label: "Unggah", state: snap ? "done" : "current" },
    { label: "Hasil ingest", state: !snap ? "todo" : ready ? "done" : "current" },
    { label: "Pemetaan & normalisasi", state: !ready ? "todo" : sourceDatasets.length ? "done" : "current" },
    { label: "Kualitas", state: sourceDatasets.some((d) => d.status === "quality_review" || d.status === "published") ? "done" : "todo" },
    { label: "Terbit", state: sourceDatasets.some((d) => d.status === "published") ? "done" : "todo" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={pending} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={base} className="text-xs text-ink-3 hover:text-accent">Persiapan data</Link>
          <h2 className="text-base font-semibold">{source.name}</h2>
        </div>
        <Stepper steps={steps} />
      </div>

      {canWrite && (
        <SectionCard title="1 · Unggah event log" description="File diunggah langsung ke object storage proyek dan tidak dapat ditimpa.">
          <UploadPanel projectId={projectId} sourceId={sourceId} />
        </SectionCard>
      )}

      {snapshots.length > 0 && snap && (
        <SectionCard
          title="2 · Hasil ingest"
          description={snapshots.length > 1 ? undefined : snap.fileName}
          actions={snapshots.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {snapshots.slice(0, 6).map((s) => (
                <Link key={s.id} href={`?snapshot=${s.id}`} className={`rounded-md border px-2 py-1 text-xs ${s.id === snap.id ? "border-accent text-accent" : "border-line text-ink-2"}`}>
                  {s.fileName} · {formatDateTime(s.createdAt, project.timezone)}
                </Link>
              ))}
            </div>
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <SnapshotStatus status={snap.status} />
              {snap.reusedFrom && <span className="text-xs text-ink-3">Checksum sama dengan snapshot sebelumnya; hasil staging dipakai ulang.</span>}
              {snap.projectStatusChanged && <span className="text-xs text-status-suspended">Status proyek berubah selama pemrosesan.</span>}
            </div>
            {pending && <p className="text-sm text-ink-2">Memverifikasi checksum, mendeteksi format dan encoding, lalu membaca file secara bertahap…</p>}
            {snap.status === "failed" && <p role="alert" className="text-sm text-error-primary">{snap.errorMessage ?? "Snapshot gagal diproses."}</p>}
            {(snap.rowCount ?? 0) > 0 && (
              <KeyValue items={[
                { label: "File", value: `${snap.fileName} · ${formatBytes(snap.sizeBytes ?? snap.declaredSize)}` },
                { label: "Format", value: snap.format?.toUpperCase() ?? "–" },
                { label: "Encoding", value: snap.encoding ?? "–" },
                { label: "Delimiter", value: snap.delimiter ? DELIM[snap.delimiter] ?? snap.delimiter : "–" },
                { label: "Baris", value: formatInt(snap.rowCount) },
                { label: "Kolom", value: formatInt(snap.columns?.length) },
              ]} />
            )}
            {(snap.reviewReasons?.length ?? 0) > 0 && (
              <ul className="list-disc rounded-lg border border-[#f3d48a] bg-[#fdf6e3] py-2 pr-3 pl-7 text-sm">
                {snap.reviewReasons!.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            {snap.errorSamples.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Contoh baris yang dilewati ({formatInt(snap.invalidRowCount)})</summary>
                <ul className="mt-2 flex flex-col gap-1 text-ink-2">{snap.errorSamples.map((e, i) => <li key={i}>Baris {e.row ?? "?"}: {e.message}</li>)}</ul>
              </details>
            )}
            {snap.preview && snap.preview.length > 0 && snap.columns && (
              <div className="max-h-72 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-sidebar text-ink-3"><tr><th className="px-2 py-1.5 font-medium">#</th>{snap.columns.map((c) => <th key={c} className="px-2 py-1.5 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line bg-white">
                    {snap.preview.slice(0, 20).map((r) => (
                      <tr key={r.__row}><td className="px-2 py-1 text-ink-3">{r.__row}</td>{snap.columns!.map((c) => <td key={c} className="max-w-56 truncate px-2 py-1">{r[c] ?? <span className="text-ink-3">∅</span>}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canWrite && (snap.status === "needs_review" || snap.status === "awaiting_upload") && (
              <SnapshotReviewActions projectId={projectId} snapshotId={snap.id} canApprove={snap.status === "needs_review"} />
            )}
          </div>
        </SectionCard>
      )}

      {ready && snap?.columns && (
        <SectionCard title="3 · Pemetaan kolom & normalisasi aktivitas" description={mapping ? `Dimulai dari mapping versi ${mapping.version}. Perubahan disimpan sebagai versi baru.` : "Kolom XES standar dan nama kolom umum sudah disarankan."}>
          <MappingEditor
            key={`${snap.id}-${mapping?.id ?? "new"}`}
            projectId={projectId} sourceId={sourceId} snapshotId={snap.id} columns={snap.columns}
            initial={mapping?.config ?? null} suggested={snap.suggestedMapping ?? {}} defaultTimezone={project.timezone} readOnly={!canWrite}
          />
        </SectionCard>
      )}

      {sourceDatasets.length > 0 && (
        <SectionCard title="Dataset dari sumber ini">
          <ul className="divide-y divide-line">
            {sourceDatasets.map((d) => (
              <li key={d.id}>
                <Link href={`${base}/datasets/${d.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-accent">
                  <span className="font-medium">{d.name}</span>
                  <DatasetStatus status={d.status} />
                  <span className="ml-auto text-xs text-ink-3">{formatDateTime(d.createdAt, project.timezone)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
