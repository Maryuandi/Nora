import { Archive, CheckCircle, Eye, PencilSimple } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { RULE_STATUS_LABEL } from "@/lib/mock/rules";
import type { RuleStatus } from "@/lib/mock/types";

const ICON = { draf: PencilSimple, ditinjau: Eye, disetujui: CheckCircle, usang: Archive } as const;
const TONE: Record<RuleStatus, string> = { draf: "text-ink-3", ditinjau: "text-accent", disetujui: "text-status-active", usang: "text-status-suspended" };

export function RuleStatusBadge({ status }: { status: RuleStatus }) {
  const I = ICON[status];
  return (
    <Pill>
      <I size={14} weight="fill" className={TONE[status]} aria-hidden />
      {RULE_STATUS_LABEL[status]}
    </Pill>
  );
}
