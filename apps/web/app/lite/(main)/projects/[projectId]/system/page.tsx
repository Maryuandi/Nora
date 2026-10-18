import { notFound } from "next/navigation";
import { StatePill } from "@/components/lite/badges";
import { DataTable, KeyValue, SectionCard, Td } from "@/components/lite/ui";
import { checkAll } from "@/lib/health";
import { formatDateTime } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { projectPrefix } from "@nora/authz";

export const metadata = { title: "Status sistem proyek" };

const SERVICE_LABEL = { postgres: "PostgreSQL", neo4j: "Neo4j", minio: "Object storage", temporal: "Temporal" } as const;

export default async function SystemPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, may } = await loadPageProject(projectId);
  if (!may("system.read")) notFound();
  const services = await checkAll();
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
