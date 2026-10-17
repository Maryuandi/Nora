import { CheckCircle, ShieldWarning, XCircle } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import type { InterpretationStatus } from "@/lib/mock/types";

export const INTERPRETATION_STATUS_LABEL: Record<InterpretationStatus, string> = { lolos_pemeriksaan: "Lolos pemeriksaan", gagal_pemeriksaan: "Gagal pemeriksaan" };

export function InterpretationStatusBadge({ status }: { status: InterpretationStatus }) {
  const ok = status === "lolos_pemeriksaan";
  const I = ok ? CheckCircle : XCircle;
  return (
    <Pill>
      <I size={14} weight="fill" className={ok ? "text-status-active" : "text-status-ended"} aria-hidden />
      {INTERPRETATION_STATUS_LABEL[status]}
    </Pill>
  );
}

export const OverriddenPill = () => (
  <Pill>
    <ShieldWarning size={14} weight="fill" className="text-status-suspended" aria-hidden />
    Dikesampingkan
  </Pill>
);
