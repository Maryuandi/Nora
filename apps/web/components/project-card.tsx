import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { AvatarStack } from "@/components/nora/avatar";
import { RoleBadge, StatusBadge } from "@/components/nora/badges";
import type { Project, Role } from "@/lib/mock/types";

import { formatDate as fmt } from "@/lib/format";
export const formatPeriod = (p: Project) => (p.contractEnd ? `${fmt(p.contractStart)} – ${fmt(p.contractEnd)}` : "Belum diatur");

export function ProjectCard({ project, clientName, role, members }: { project: Project; clientName: string; role: Role; members: string[] }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex min-w-0 flex-col rounded-lg border border-line bg-white p-4 shadow-card transition-colors hover:border-[#d6d3ce]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink group-hover:text-accent">{project.name}</h3>
          <p className="truncate text-sm text-ink-3">{clientName}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <StatusBadge status={project.status} />
          <RoleBadge role={role} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-2">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 truncate"><CalendarBlank size={14} aria-hidden />{formatPeriod(project)}</span>
        </span>
        <AvatarStack names={members} />
      </div>
    </Link>
  );
}
