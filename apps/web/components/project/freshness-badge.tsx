import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";

export function FreshnessBadge({ stale }: { stale: boolean }) {
  const I = stale ? WarningCircle : CheckCircle;
  return (
    <Pill>
      <I size={14} weight="fill" className={stale ? "text-status-suspended" : "text-status-active"} aria-hidden />
      {stale ? "Usang" : "Segar"}
    </Pill>
  );
}
