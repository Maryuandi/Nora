import Link from "next/link";
import { Buildings, CalendarBlank, FolderSimpleDashed, Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/base/buttons/button";
import { ProjectStatusBadge, RoleBadge } from "@/components/lite/badges";
import { EmptyState } from "@/components/lite/ui";
import { PageHeader } from "@/components/shell/page-header";
import { currentViewer } from "@/lib/lite/auth";
import { formatDate } from "@/lib/lite/format";
import { newCorrelationId } from "@/lib/lite/http";
import { listProjects } from "@/lib/lite/projects";

export const metadata = { title: "Proyek" };

export default async function LiteProjectsPage() {
  const viewer = (await currentViewer())!;
  const projects = await listProjects(viewer, newCorrelationId());
  const isAdmin = viewer.globalRole === "admin";
  return (
    <>
      <PageHeader
        title="Proyek"
        stats={[
          { label: "Proyek aktif", value: projects.filter((p) => p.status === "active").length },
          { label: "Draft", value: projects.filter((p) => p.status === "draft").length },
          { label: "Total", value: projects.length },
        ]}
        actions={isAdmin && (
          <>
            <Button color="secondary" size="xs" href="/clients/new" iconLeading={<Buildings data-icon="leading" aria-hidden />}>Tambah klien</Button>
            <Button color="primary" size="xs" href="/projects/new" iconLeading={<Plus data-icon="leading" aria-hidden />}>Buat proyek</Button>
          </>
        )}
      />
      <div className="px-8 py-6">
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderSimpleDashed}
            title="Belum ada proyek"
            action={isAdmin && <Button color="primary" size="xs" href="/projects/new" iconLeading={<Plus data-icon="leading" aria-hidden />}>Buat proyek</Button>}
          >
            {isAdmin ? "Buat klien lalu proyek pertama. Proyek baru berstatus Draft dan tidak memuat data apa pun." : "Kamu belum menjadi anggota proyek mana pun. Hubungi Administrator proyek untuk diundang."}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="group flex min-w-0 flex-col rounded-lg border border-line bg-white p-4 shadow-card transition-colors hover:border-[#d6d3ce]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-ink group-hover:text-accent">{p.name}</h3>
                    <p className="truncate text-sm text-ink-3">{p.clientName} · {p.processName}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <ProjectStatusBadge status={p.status} />
                    <RoleBadge role={p.role} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-2">
                  <CalendarBlank size={14} aria-hidden />
                  {formatDate(p.contractStart)} – {formatDate(p.contractEnd)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
