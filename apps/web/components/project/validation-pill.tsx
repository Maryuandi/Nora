import { CheckCircle, HourglassMedium, MinusCircle, Warning, XCircle } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { VALIDATION_LABEL } from "@/lib/mock/recommend";
import type { CheckResult, ValidationStatus } from "@/lib/mock/types";

const ICON = { tervalidasi: CheckCircle, belum_layak_dinilai: HourglassMedium, tidak_memenuhi_syarat: XCircle, perlu_review: Warning } as const;
const TONE: Record<ValidationStatus, string> = { tervalidasi: "text-status-active", belum_layak_dinilai: "text-ink-3", tidak_memenuhi_syarat: "text-status-suspended", perlu_review: "text-accent" };

export function ValidationPill({ status }: { status: ValidationStatus }) {
  const I = ICON[status];
  return <Pill><I size={14} weight="fill" className={TONE[status]} aria-hidden />{VALIDATION_LABEL[status]}</Pill>;
}

const CHECK_ICON = { lolos: CheckCircle, gagal: XCircle, tidak_dapat_diperiksa: MinusCircle } as const;
const CHECK_TONE: Record<CheckResult, string> = { lolos: "text-status-active", gagal: "text-status-suspended", tidak_dapat_diperiksa: "text-ink-3" };
export const CHECK_TEXT: Record<CheckResult, string> = { lolos: "Lolos", gagal: "Gagal", tidak_dapat_diperiksa: "Tidak dapat diperiksa" };

export function CheckMark({ result }: { result: CheckResult }) {
  const I = CHECK_ICON[result];
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium"><I size={16} weight="fill" className={CHECK_TONE[result]} aria-hidden />{CHECK_TEXT[result]}</span>;
}
