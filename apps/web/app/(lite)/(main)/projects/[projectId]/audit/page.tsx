import { notFound } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { StatePill } from "@/components/lite/badges";
import { DataTable, SectionCard, Td } from "@/components/lite/ui";
import { formatDateTime } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { listAudit } from "@/lib/lite/projects";

export const metadata = { title: "Audit log" };

const PAGE = 50;

export default async function AuditPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ before?: string }> }) {
  const { projectId } = await params;
  const { before } = await searchParams;
  const { viewer, project, may } = await loadPageProject(projectId);
  if (!may("audit.read")) notFound();
  const events = await listAudit(viewer, projectId, { before: Number(before) || undefined, limit: PAGE });
  const last = events.at(-1);
  return (
    <SectionCard
      title="Audit log"
      description="Catatan append-only atas mutasi dan aksi penting proyek."
      actions={before && <Button color="secondary" size="xs" href={`/projects/${projectId}/audit`}>Terbaru</Button>}
    >
      {events.length === 0 ? (
        <p className="text-sm text-ink-2">Tidak ada catatan.</p>
      ) : (
        <DataTable head={["Waktu", "Pelaku", "Aksi", "Objek", "Hasil", "Correlation ID"]}>
          {events.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap text-ink-2">{formatDateTime(e.createdAt, project.timezone)}</Td>
              <Td>{e.actorName ?? "Sistem"}</Td>
              <Td><code className="text-xs">{e.action}</code></Td>
              <Td className="text-ink-2">{e.objectType}{e.objectId && <span className="text-ink-3"> · {e.objectId.slice(0, 8)}</span>}</Td>
              <Td><StatePill tone={e.result === "success" ? "active" : e.result === "denied" ? "error" : "warning"}>{e.result === "success" ? "Sukses" : e.result === "denied" ? "Ditolak" : "Gagal"}</StatePill></Td>
              <Td><code className="text-xs text-ink-3">{e.correlationId.slice(0, 8)}</code></Td>
            </tr>
          ))}
        </DataTable>
      )}
      {events.length === PAGE && last && (
        <div className="mt-4 flex justify-center">
          <Button color="secondary" size="xs" href={`/projects/${projectId}/audit?before=${last.id}`}>Muat catatan lebih lama</Button>
        </div>
      )}
    </SectionCard>
  );
}
