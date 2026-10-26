import Link from "next/link";
import { Database } from "@phosphor-icons/react/dist/ssr";
import { NewSourceForm } from "@/components/lite/prepare/prepare-client";
import { DatasetStatus, QualityStatus, SnapshotStatus } from "@/components/lite/prepare/status";
import { DataTable, EmptyState, SectionCard, Td } from "@/components/lite/ui";
import { listDatasets, listSources } from "@/lib/lite/data";
import { formatDateTime, formatInt } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";

export const metadata = { title: "Persiapan data" };

export default async function PreparePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  const [sources, datasets] = await Promise.all([listSources(viewer, projectId), listDatasets(viewer, projectId)]);
  const canWrite = may("data.write") && project.status === "active";
  const base = `/lite/projects/${projectId}/prepare`;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Sumber data" description="Satu sumber dapat menerima beberapa unggahan; setiap unggahan menjadi snapshot immutable.">
        {sources.length === 0 ? (
          <EmptyState icon={Database} title="Belum ada sumber data">
            {canWrite ? "Buat sumber, lalu unggah event log CSV atau XES." : "Analis atau Administrator dapat menambahkan sumber saat proyek aktif."}
          </EmptyState>
        ) : (
          <DataTable head={["Sumber", "Snapshot terakhir", "Dataset terakhir", "Dibuat"]}>
            {sources.map((s) => (
              <tr key={s.id}>
                <Td><Link className="font-medium text-ink hover:text-accent" href={`${base}/sources/${s.id}`}>{s.name}</Link><div className="text-xs text-ink-3">{s.snapshotCount} snapshot</div></Td>
                <Td>{s.latestSnapshot ? <div className="flex flex-col items-start gap-1"><SnapshotStatus status={s.latestSnapshot.status} /><span className="text-xs text-ink-3">{s.latestSnapshot.fileName}</span></div> : <span className="text-ink-3">–</span>}</Td>
                <Td>{s.latestDataset ? <Link href={`${base}/datasets/${s.latestDataset.id}`} className="flex flex-col items-start gap-1"><DatasetStatus status={s.latestDataset.status} /><span className="text-xs text-ink-3">{s.latestDataset.name}</span></Link> : <span className="text-ink-3">–</span>}</Td>
                <Td className="text-ink-2">{formatDateTime(s.createdAt, project.timezone)}</Td>
              </tr>
            ))}
          </DataTable>
        )}
        {canWrite && <div className="mt-4 border-t border-line pt-4"><NewSourceForm projectId={projectId} /></div>}
      </SectionCard>

      {datasets.length > 0 && (
        <SectionCard title="Versi dataset" description="Analisis hanya memakai dataset yang sudah terbit. Dataset terbit tidak dapat diubah.">
          <DataTable head={["Dataset", "Status", "Kualitas", "Event", "Kasus", "Terbit"]}>
            {datasets.map((d) => (
              <tr key={d.id}>
                <Td><Link className="font-medium hover:text-accent" href={`${base}/datasets/${d.id}`}>{d.name}</Link></Td>
                <Td><DatasetStatus status={d.status} /></Td>
                <Td>{d.qualityStatus ? <QualityStatus status={d.qualityStatus} /> : <span className="text-ink-3">–</span>}</Td>
                <Td>{formatInt(d.eventCount)}</Td>
                <Td>{formatInt(d.caseCount)}</Td>
                <Td className="text-ink-2">{d.publishedAt ? formatDateTime(d.publishedAt, project.timezone) : "–"}</Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      )}
    </div>
  );
}
