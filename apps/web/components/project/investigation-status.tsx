import { CheckCircle, Hourglass, MagnifyingGlass, Scales } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { INVESTIGATION_STATUS_LABEL } from "@/lib/mock/investigation";
import type { InvestigationStatus } from "@/lib/mock/types";

const META: Record<InvestigationStatus, { icon: Icon; color: string }> = {
  terbuka: { icon: MagnifyingGlass, color: "text-accent" },
  menunggu_informasi: { icon: Hourglass, color: "text-status-suspended" },
  siap_diputuskan: { icon: Scales, color: "text-status-active" },
  selesai: { icon: CheckCircle, color: "text-ink-3" },
};

export function InvestigationStatusPill({ status }: { status: InvestigationStatus }) {
  const { icon: I, color } = META[status];
  return (
    <Pill>
      <I size={14} weight="fill" className={color} aria-hidden />
      {INVESTIGATION_STATUS_LABEL[status]}
    </Pill>
  );
}
