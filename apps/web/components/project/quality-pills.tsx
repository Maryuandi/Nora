import { CheckCircle, MinusCircle, Question, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Pill } from "@/components/nora/badges";
import { VERDICT_LABEL, type QualityFinding, type QualityReport } from "@/lib/mock/quality";
import type { Severity } from "@/lib/mock/types";

const SEVERITY: Record<Severity, { label: string; dot: string }> = {
  tinggi: { label: "Tinggi", dot: "bg-status-ended" },
  sedang: { label: "Sedang", dot: "bg-status-suspended" },
  info: { label: "Info", dot: "bg-status-neutral" },
};
const FINDING: Record<QualityFinding["status"], { label: string; icon: Icon; color: string }> = {
  ditemukan: { label: "Ditemukan", icon: WarningCircle, color: "text-status-suspended" },
  bersih: { label: "Bersih", icon: CheckCircle, color: "text-status-active" },
  tidak_berlaku: { label: "Tidak berlaku", icon: MinusCircle, color: "text-ink-3" },
  tidak_diketahui: { label: "Tidak diketahui", icon: Question, color: "text-ink-3" },
};
const VERDICT: Record<QualityReport["verdict"], { icon: Icon; color: string }> = {
  siap: { icon: CheckCircle, color: "text-status-active" },
  siap_catatan: { icon: WarningCircle, color: "text-status-suspended" },
  belum_layak: { icon: XCircle, color: "text-status-ended" },
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill dot={SEVERITY[severity].dot}>{SEVERITY[severity].label}</Pill>;
}

export function FindingStatusPill({ status }: { status: QualityFinding["status"] }) {
  const m = FINDING[status];
  const I = m.icon;
  return (
    <Pill>
      <I size={14} weight={status === "tidak_berlaku" || status === "tidak_diketahui" ? "bold" : "fill"} className={m.color} aria-hidden />
      {m.label}
    </Pill>
  );
}

export function VerdictPill({ verdict }: { verdict: QualityReport["verdict"] }) {
  const m = VERDICT[verdict];
  const I = m.icon;
  return (
    <Pill>
      <I size={14} weight="fill" className={m.color} aria-hidden />
      {VERDICT_LABEL[verdict]}
    </Pill>
  );
}
