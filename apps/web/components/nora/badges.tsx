import type { AuditResult, ProjectStatus, Role } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const STATUS: Record<ProjectStatus, { label: string; dot: string }> = {
  draft: { label: "Draft", dot: "bg-status-neutral" },
  aktif: { label: "Aktif", dot: "bg-status-active" },
  ditangguhkan: { label: "Ditangguhkan", dot: "bg-status-suspended" },
  berakhir: { label: "Berakhir", dot: "bg-status-ended" },
  diarsipkan: { label: "Diarsipkan", dot: "bg-status-neutral" },
};

const RESULT: Record<AuditResult, { label: string; dot: string }> = {
  sukses: { label: "Sukses", dot: "bg-status-active" },
  ditolak: { label: "Ditolak", dot: "bg-status-ended" },
  gagal: { label: "Gagal", dot: "bg-status-suspended" },
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

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Pill dot={STATUS[status].dot}>{STATUS[status].label}</Pill>;
}

export function ResultBadge({ result }: { result: AuditResult }) {
  return <Pill dot={RESULT[result].dot}>{RESULT[result].label}</Pill>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <Pill className="text-ink-2">{ROLE_LABEL[role]}</Pill>;
}

export { STATUS as STATUS_META };
