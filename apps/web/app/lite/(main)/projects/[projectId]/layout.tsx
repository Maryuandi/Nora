import { Banner } from "@/components/nora/banner";
import { ProjectStatusBadge, ROLE_LABEL } from "@/components/lite/badges";
import { ProjectNav, ProjectUtilities } from "@/components/lite/project-nav";
import { PageHeader } from "@/components/shell/page-header";
import { formatDate } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";

const READ_ONLY: Record<string, string> = {
  draft: "Proyek masih Draft. Aktifkan proyek sebelum menambahkan data atau menjalankan analisis.",
  suspended: "Proyek ditangguhkan. Data dan hasil dapat dibaca, tetapi data dan pekerjaan baru tidak diterima.",
  ended: "Kontrak proyek telah berakhir. Proyek hanya dapat dibaca.",
  archived: "Proyek diarsipkan dan hanya dapat dibaca.",
};

export default async function LiteProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, may } = await loadPageProject(projectId);
  return (
    <>
      <ProjectNav projectId={project.id} />
      <PageHeader
        title={project.name}
        eyebrow={project.clientName}
        actions={<ProjectUtilities projectId={project.id} items={{ members: may("members.read"), audit: may("audit.read"), settings: may("project.update"), system: may("system.read") }} />}
        stats={[
          { label: "Status", value: <ProjectStatusBadge status={project.status} /> },
          { label: "Proses", value: project.processName },
          { label: "Periode kontrak", value: `${formatDate(project.contractStart)} – ${formatDate(project.contractEnd)}` },
          { label: "Peranmu", value: ROLE_LABEL[project.role] },
        ]}
      />
      {READ_ONLY[project.status] && (
        <div className="px-8 pt-4">
          <Banner tone={project.status === "draft" ? "info" : "warning"}>{READ_ONLY[project.status]}</Banner>
        </div>
      )}
      <div className="px-8 py-6">{children}</div>
    </>
  );
}
