import { notFound } from "next/navigation";
import { RoleBadge, StatePill } from "@/components/lite/badges";
import { AddMemberForm, MemberRowActions } from "@/components/lite/members-panel";
import { DataTable, SectionCard, Td } from "@/components/lite/ui";
import { formatDate } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { listMembers } from "@/lib/lite/projects";

export const metadata = { title: "Anggota" };

export default async function MembersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  if (!may("members.read")) notFound();
  const members = await listMembers(viewer, projectId);
  const manage = may("members.manage") && project.status !== "archived";
  return (
    <div className="flex flex-col gap-4">
      {manage && (
        <SectionCard title="Tambah anggota" description="Akun yang belum ada dibuat sebagai undangan dengan tautan aktivasi.">
          <AddMemberForm projectId={projectId} />
        </SectionCard>
      )}
      <SectionCard title={`Anggota (${members.length})`}>
        <DataTable head={["Nama", "Email", "Peran", "Status akun", "Ditambahkan", ...(manage ? [""] : [])]}>
          {members.map((m) => (
            <tr key={m.userId}>
              <Td className="font-medium">{m.name}{m.userId === viewer.id && <span className="ml-1 text-ink-3">(kamu)</span>}</Td>
              <Td className="text-ink-2">{m.email}</Td>
              <Td><RoleBadge role={m.role} /></Td>
              <Td>{m.status === "active" ? <StatePill tone="active">Aktif</StatePill> : m.status === "invited" ? <StatePill tone="info">Diundang</StatePill> : <StatePill tone="neutral">Nonaktif</StatePill>}</Td>
              <Td className="text-ink-2">{formatDate(m.addedAt)}</Td>
              {manage && <Td><MemberRowActions projectId={projectId} userId={m.userId} role={m.role} email={m.email} /></Td>}
            </tr>
          ))}
        </DataTable>
      </SectionCard>
    </div>
  );
}
