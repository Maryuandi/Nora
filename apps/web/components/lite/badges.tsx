import { CheckCircle, Circle, CircleDashed, WarningCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ProjectStatus, Role } from "@nora/authz";
import { cx } from "@/utils/cx";

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2 text-xs font-medium text-ink", className)}>{children}</span>;
}

export type Tone = "neutral" | "active" | "warning" | "error" | "info";

const TONE: Record<Tone, { icon: Icon; color: string; weight: "bold" | "fill" }> = {
  neutral: { icon: Circle, color: "text-ink-3", weight: "bold" },
  active: { icon: CheckCircle, color: "text-status-active", weight: "fill" },
  warning: { icon: WarningCircle, color: "text-status-suspended", weight: "fill" },
  error: { icon: XCircle, color: "text-status-ended", weight: "fill" },
  info: { icon: CircleDashed, color: "text-accent", weight: "bold" },
};

/** Status pill with an icon whose shape, not only colour, carries the tone. */
export function StatePill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const t = TONE[tone];
  const I = t.icon;
  return (
    <span title={title}>
      <Pill>
        <I size={14} weight={t.weight} className={t.color} aria-hidden />
        {children}
      </Pill>
    </span>
  );
}

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Aktif", tone: "active" },
  suspended: { label: "Ditangguhkan", tone: "warning" },
  ended: { label: "Berakhir", tone: "error" },
  archived: { label: "Diarsipkan", tone: "neutral" },
};

export const PROJECT_STATUS_LABEL = Object.fromEntries(Object.entries(PROJECT_STATUS).map(([k, v]) => [k, v.label])) as Record<ProjectStatus, string>;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatePill tone={PROJECT_STATUS[status].tone}>{PROJECT_STATUS[status].label}</StatePill>;
}

export const ROLE_LABEL: Record<Role, string> = { administrator: "Administrator", analyst: "Analis", process_owner: "Pemilik proses" };

export function RoleBadge({ role }: { role: Role }) {
  return <Pill className="text-ink-2">{ROLE_LABEL[role]}</Pill>;
}
