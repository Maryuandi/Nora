import { notFound } from "next/navigation";
import { StatePill } from "@/components/lite/badges";
import { RebuildGraphButton } from "@/components/lite/status-actions";
import { graphStatusFor } from "@/lib/lite/graph";
import { DataTable, KeyValue, SectionCard, Td } from "@/components/lite/ui";
import { checkAll } from "@/lib/health";
import { formatDateTime } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { projectPrefix } from "@nora/authz";

export const metadata = { title: "Status sistem proyek" };

const SERVICE_LABEL = { postgres: "PostgreSQL", neo4j: "Neo4j", minio: "Object storage", temporal: "Temporal" } as const;

export default async function SystemPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  if (!may("system.read")) notFound();
  const [services, graph] = await Promise.all([checkAll(), graphStatusFor(viewer, projectId)]);
  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <SectionCard title="Layanan">
        <DataTable head={["Layanan", "Status", "Keterangan"]}>
          {services.map((s) => (
            <tr key={s.name}>
              <Td className="font-medium">{SERVICE_LABEL[s.name]}</Td>
              <Td>{s.ok ? <StatePill tone="active">Tersedia</StatePill> : <StatePill tone="error">Tidak tersedia</StatePill>}</Td>
              <Td className="text-ink-2">{s.message}</Td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>
      <SectionCard title="Proyeksi graph (Neo4j)" description="Neo4j adalah proyeksi turunan; PostgreSQL dan object storage tetap otoritatif." actions={<RebuildGraphButton projectId={projectId} />}>
        <KeyValue
          items={[
            { label: "Sequence terproyeksi", value: `${graph.projectedSequence} dari ${graph.latestSequence}` },
            { label: "Menunggu", value: `${graph.pending} event${graph.stale ? ` · tertinggal ${graph.lagSeconds} dtk` : ""}` },
            { label: "Node / relasi", value: graph.counts ? `${graph.counts.nodes} / ${graph.counts.relations}` : "Neo4j tidak tersedia" },
            { label: "Rebuild terakhir", value: graph.rebuiltAt ? formatDateTime(graph.rebuiltAt, project.timezone) : graph.rebuildRequestedAt ? "Diminta, menunggu worker" : "–" },
          ]}
        />
        {graph.deadLetters.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-status-ended">Dead letter ({graph.deadLetters.length})</p>
            <DataTable head={["Sequence", "Objek", "Percobaan", "Galat"]}>
              {graph.deadLetters.map((d) => (
                <tr key={d.sequence}><Td>{d.sequence}</Td><Td className="text-xs">{d.aggregateType} · {d.aggregateId.slice(0, 8)}</Td><Td>{d.attempts}</Td><Td className="text-xs text-ink-2">{d.error}</Td></tr>
              ))}
            </DataTable>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Batas data proyek">
        <KeyValue
          items={[
            { label: "Project ID", value: <code className="text-xs">{project.id}</code> },
            { label: "Prefix object storage", value: <code className="text-xs">{projectPrefix(project.id)}</code> },
            { label: "Status berubah", value: formatDateTime(project.statusChangedAt, project.timezone) },
            { label: "Aktivitas terakhir", value: formatDateTime(project.lastActivityAt, project.timezone) },
          ]}
        />
      </SectionCard>
    </div>
  );
}
