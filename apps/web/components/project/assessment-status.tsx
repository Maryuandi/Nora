import { CheckCircle, CircleDashed, Eye, Question, XCircle } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { STATUS_LABEL } from "@/lib/mock/assessment";
import type { AssessmentStatus } from "@/lib/mock/types";

const ICON = { otomatis: CheckCircle, perlu_review: Eye, informasi_tidak_cukup: Question, gagal: XCircle, tertunda: CircleDashed } as const;
const TONE: Record<AssessmentStatus, string> = {
  otomatis: "text-status-active", perlu_review: "text-accent", informasi_tidak_cukup: "text-ink-3", gagal: "text-status-ended", tertunda: "text-status-suspended",
};

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  const I = ICON[status];
  return (
    <Pill>
      <I size={14} weight="fill" className={TONE[status]} aria-hidden />
      {STATUS_LABEL[status]}
    </Pill>
  );
}
