import { Circle, CheckCircle, CircleDashed, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { AuditResult, ProjectStatus, Role } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const STATUS: Record<ProjectStatus, { label: string; dot: string; icon: Icon; color: string }> = {
  draft: { label: "Draft", dot: "bg-status-neutral", icon: Circle, color: "text-ink-3" },
  aktif: { label: "Aktif", dot: "bg-status-active", icon: CheckCircle, color: "text-status-active" },
  ditangguhkan: { label: "Ditangguhkan", dot: "bg-status-suspended", icon: WarningCircle, color: "text-status-suspended" },
  berakhir: { label: "Berakhir", dot: "bg-status-ended", icon: XCircle, color: "text-status-ended" },
  diarsipkan: { label: "Diarsipkan", dot: "bg-status-neutral", icon: CircleDashed, color: "text-ink-3" },
};

const RESULT: Record<AuditResult, { label: string; dot: string; icon: Icon; color: string }> = {
  sukses: { label: "Sukses", dot: "bg-status-active", icon: CheckCircle, color: "text-status-active" },
  ditolak: { label: "Ditolak", dot: "bg-status-ended", icon: XCircle, color: "text-status-ended" },
  gagal: { label: "Gagal", dot: "bg-status-suspended", icon: WarningCircle, color: "text-status-suspended" },
};

export const ROLE_LABEL: Record<Role, string> = {
  administrator: "Administrator",
  analis: "Analis",
  pemilik_proses: "Pemilik proses",
};

function Pill({ dot, children, className }: { dot?: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2 text-xs font-medium text-ink",
        className,
      )}
    >
      {dot && <span aria-hidden className={cx("size-2 rounded-[2px]", dot)} />}
      {children}
    </span>
  );
}

function StatusText({ meta }: { meta: { label: string; icon: Icon; color: string } }) {
  const I = meta.icon;
  return (
    <Pill>
      <I size={14} weight={meta.icon === Circle || meta.icon === CircleDashed ? "bold" : "fill"} className={meta.color} aria-hidden />
      {meta.label}
    </Pill>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusText meta={STATUS[status]} />;
}

export function ResultBadge({ result }: { result: AuditResult }) {
  return <StatusText meta={RESULT[result]} />;
}

export function RoleBadge({ role }: { role: Role }) {
  return <Pill className="text-ink-2">{ROLE_LABEL[role]}</Pill>;
}

export { STATUS as STATUS_META };
