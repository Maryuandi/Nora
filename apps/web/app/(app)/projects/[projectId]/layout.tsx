"use client";

import { usePathname } from "next/navigation";
import { ClockCounterClockwise, Database, GearSix, Scales, SquaresFour, UsersThree } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { formatPeriod } from "@/components/project-card";
import { useProject } from "@/components/project/use-project";
import { rulesForProject } from "@/lib/mock/reducer";
import { latestByKey } from "@/lib/mock/rules";
import { PageHeader } from "@/components/shell/page-header";
import { PublishTabs } from "@/components/shell/sidebar-tabs";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ctx = useProject();
  if (!ctx) return <NotFoundPanel />;
  const { project, client, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const members = state.memberships.filter((m) => m.projectId === project.id).length;
  const sources = state.sources.filter((s) => s.projectId === project.id).length;
  const rules = latestByKey(rulesForProject(state, project.id)).length;
  const audit = state.audit.filter((a) => a.projectId === project.id).length;

  const tabs = [
    { label: "Ringkasan", icon: SquaresFour, href: base },
    { label: "Sumber data", icon: Database, href: `${base}/sources`, count: sources },
    { label: "Konteks", icon: Scales, href: `${base}/context/rules`, count: rules },
    { label: "Anggota", icon: UsersThree, href: `${base}/members`, count: members },
    { label: "Audit log", icon: ClockCounterClockwise, href: `${base}/audit`, count: audit },
    ...(can("project.status", project.id) ? [{ label: "Pengaturan", icon: GearSix, href: `${base}/settings` }] : []),
  ].map((t) => ({ ...t, active: t.href === `${base}/sources` ? path.startsWith(t.href) || path.startsWith(`${base}/snapshots`) : t.href === `${base}/context/rules` ? path.startsWith(`${base}/context`) : path === t.href }));

  return (
    <>
      <PublishTabs tabs={tabs} />
      <PageHeader
        title={project.name}
        stats={[
          { label: "Status", value: <StatusBadge status={project.status} /> },
          { label: "Proses", value: project.process.name },
          { label: "Periode kontrak", value: formatPeriod(project) },
          { label: "Perusahaan", value: client.name },
        ]}
      />
      <div className="px-8 py-6">{children}</div>
    </>
  );
}
