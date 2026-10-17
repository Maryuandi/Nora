"use client";

import Link from "next/link";
import { Archive, Buildings, CheckCircle, FileDashed, FolderSimpleDashed, PauseCircle, Plus, SquaresFour, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { ProjectCard } from "@/components/project-card";
import { PageHeader, type HeaderTab } from "@/components/shell/page-header";
import { contractEndingSoon, projectsForViewer } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";
import type { ProjectStatus } from "@/lib/mock/types";

const TABS: { status: ProjectStatus | null; label: string; icon: HeaderTab["icon"] }[] = [
  { status: null, label: "Semua", icon: SquaresFour },
  { status: "aktif", label: "Aktif", icon: CheckCircle },
  { status: "draft", label: "Draft", icon: FileDashed },
  { status: "ditangguhkan", label: "Ditangguhkan", icon: PauseCircle },
  { status: "berakhir", label: "Berakhir", icon: XCircle },
  { status: "diarsipkan", label: "Diarsipkan", icon: Archive },
];

export function ProjectList({ status }: { status: ProjectStatus | null }) {
  const { state, roleIn, can } = useMock();
  const mine = projectsForViewer(state);
  const shown = status ? mine.filter((p) => p.status === status) : mine;
  const ending = mine.filter((p) => contractEndingSoon(p));
  const memberIds = new Set(state.memberships.filter((m) => mine.some((p) => p.id === m.projectId)).map((m) => m.userId));
  const clientName = (id: string) => state.clients.find((c) => c.id === id)?.name ?? "—";
  const membersOf = (pid: string) =>
    state.memberships.filter((m) => m.projectId === pid).map((m) => state.users.find((u) => u.id === m.userId)!.name);

  return (
    <>
      <PageHeader
        title="Proyek"
        stats={[
          { label: "Proyek aktif", value: mine.filter((p) => p.status === "aktif").length },
          { label: "Kontrak segera berakhir", value: ending.length },
          { label: "Anggota", value: memberIds.size },
        ]}
        actions={
          <>
            {can("client.create") && <Button color="secondary" size="sm" href="/clients/new" iconLeading={Buildings}>Tambah klien</Button>}
            {can("project.create") && <Button color="primary" size="sm" href="/projects/new" iconLeading={Plus}>Buat proyek</Button>}
          </>
        }
        tabs={TABS.map((t) => ({
          label: t.label,
          icon: t.icon,
          href: t.status ? `/?status=${t.status}` : "/",
          count: t.status ? mine.filter((p) => p.status === t.status).length : mine.length,
          active: t.status === status,
        }))}
      />
      <div className="flex flex-col gap-4 px-8 py-6">
        {ending.length > 0 && (
          <Banner action={<Link href={`/projects/${ending[0].id}/settings`}>Tinjau</Link>}>
            {ending.length === 1 ? `Kontrak ${ending[0].name} berakhir dalam 14 hari.` : `${ending.length} kontrak berakhir dalam 14 hari.`}
          </Banner>
        )}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-white px-6 py-16 text-center">
            <FolderSimpleDashed size={32} className="text-ink-3" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{mine.length === 0 ? "Belum ada proyek" : "Tidak ada proyek dengan status ini"}</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-2">
              {mine.length === 0 ? "Kamu belum menjadi anggota proyek mana pun. Hubungi Administrator proyek untuk diundang." : "Pilih tab lain untuk melihat proyek lainnya."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {shown.map((p) => (
              <ProjectCard key={p.id} project={p} clientName={clientName(p.clientId)} role={roleIn(p.id)!} members={membersOf(p.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
