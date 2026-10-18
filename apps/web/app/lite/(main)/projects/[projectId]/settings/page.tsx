import { notFound } from "next/navigation";
import { ProjectStatusBadge } from "@/components/lite/badges";
import { EditProjectForm } from "@/components/lite/project-forms";
import { StatusButton } from "@/components/lite/status-actions";
import { SectionCard } from "@/components/lite/ui";
import { formatDateTime } from "@/lib/lite/format";
import { loadPageProject } from "@/lib/lite/page";
import { STATUS_TRANSITIONS } from "@/lib/lite/projects";

export const metadata = { title: "Pengaturan proyek" };

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, may } = await loadPageProject(projectId);
  if (!may("project.update")) notFound();
  const next = STATUS_TRANSITIONS[project.status];
  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <SectionCard title="Status proyek" description="Hanya proyek Aktif yang menerima data dan pekerjaan baru. Ditangguhkan dan Berakhir tetap dapat dibaca.">
        <div className="flex flex-wrap items-center gap-3">
          <ProjectStatusBadge status={project.status} />
          <span className="text-sm text-ink-3">sejak {formatDateTime(project.statusChangedAt, project.timezone)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {next.map((s) => <StatusButton key={s} projectId={projectId} to={s} primary={s === "active"} />)}
          </div>
        </div>
      </SectionCard>
      <EditProjectForm
        projectId={projectId}
        readOnly={project.status === "archived"}
        initial={{
          name: project.name, description: project.description, processName: project.processName, timezone: project.timezone,
          contractStart: project.contractStart, contractEnd: project.contractEnd, retentionPolicy: project.retentionPolicy,
        }}
      />
    </div>
  );
}
