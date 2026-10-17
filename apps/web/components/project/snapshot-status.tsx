import { CheckCircle, Circle, CircleNotch, Prohibit, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import type { SnapshotStatus } from "@/lib/mock/types";

const META: Record<SnapshotStatus, { label: string; icon: Icon; color: string }> = {
  menunggu_unggah: { label: "Menunggu unggah", icon: Circle, color: "text-ink-3" },
  memvalidasi: { label: "Memvalidasi", icon: CircleNotch, color: "text-ink-3" },
  siap_dipetakan: { label: "Siap dipetakan", icon: CheckCircle, color: "text-status-active" },
  perlu_tinjauan: { label: "Perlu tinjauan", icon: WarningCircle, color: "text-status-suspended" },
  gagal: { label: "Gagal", icon: XCircle, color: "text-status-ended" },
  dibatalkan: { label: "Dibatalkan", icon: Prohibit, color: "text-ink-3" },
};

export function SnapshotStatusBadge({ status }: { status: SnapshotStatus }) {
  const m = META[status];
  const I = m.icon;
  return (
    <Pill>
      <I size={14} weight={m.icon === Circle || m.icon === CircleNotch || m.icon === Prohibit ? "bold" : "fill"} className={m.color} aria-hidden />
      {m.label}
    </Pill>
  );
}
