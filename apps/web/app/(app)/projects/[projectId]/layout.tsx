"use client";

import { usePathname } from "next/navigation";
import { ClockCounterClockwise, Database, FlowArrow, GearSix, MagnifyingGlassPlus, Pulse, Scales, Sparkle, SquaresFour, TreeStructure, UsersThree } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { formatPeriod } from "@/components/project-card";
import { useProject } from "@/components/project/use-project";
import { interpretationsForProject, investigationsForProject, rulesForProject, runsForProject } from "@/lib/mock/reducer";
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
  const interpretations = interpretationsForProject(state, project.id).length;
  const investigations = investigationsForProject(state, project.id).filter((i) => i.status !== "selesai").length;
  const audit = state.audit.filter((a) => a.projectId === project.id).length;

  const tabs = [
    { label: "Ringkasan", icon: SquaresFour, href: base },
    { label: "Sumber data", icon: Database, href: `${base}/sources`, count: sources },
    { label: "Konteks", icon: Scales, href: `${base}/context/rules`, count: rules },
    { label: "Analisis", icon: FlowArrow, href: `${base}/analysis/map` },
    { label: "Monitoring", icon: Pulse, href: `${base}/monitoring`, count: runsForProject(state, project.id).length },
    { label: "Jejak", icon: TreeStructure, href: `${base}/trace` },
    { label: "Interpretasi", icon: Sparkle, href: `${base}/interpretations`, count: interpretations },
    { label: "Investigasi", icon: MagnifyingGlassPlus, href: `${base}/investigations`, count: investigations },
    { label: "Anggota", icon: UsersThree, href: `${base}/members`, count: members },
    { label: "Audit log", icon: ClockCounterClockwise, href: `${base}/audit`, count: audit },
    ...(can("project.status", project.id) ? [{ label: "Pengaturan", icon: GearSix, href: `${base}/settings` }] : []),
  ].map((t) => ({ ...t, active: t.href === `${base}/sources` ? path.startsWith(t.href) || path.startsWith(`${base}/snapshots`) : t.href === `${base}/context/rules` ? path.startsWith(`${base}/context`) : t.href === `${base}/analysis/map` ? path.startsWith(`${base}/analysis`) : t.href === `${base}/monitoring` ? path.startsWith(`${base}/monitoring`) : t.href === `${base}/trace` || t.href === `${base}/interpretations` || t.href === `${base}/investigations` ? path.startsWith(t.href) : path === t.href }));

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
