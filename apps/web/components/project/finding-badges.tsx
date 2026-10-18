import { Pill } from "@/components/nora/badges";
import { CHANGE_LABEL, FINDING_KIND_LABEL, type ChangeStatus, type Finding, type Severity } from "@/lib/mock/findings";

const SEVERITY: Record<Severity, { label: string; dot: string }> = {
  tinggi: { label: "Tinggi", dot: "bg-status-ended" },
  sedang: { label: "Sedang", dot: "bg-status-suspended" },
  rendah: { label: "Rendah", dot: "bg-status-neutral" },
};
const CHANGE_DOT: Record<ChangeStatus, string> = {
  baru: "bg-accent", memburuk: "bg-status-ended", stabil: "bg-status-neutral", membaik: "bg-status-active", tidak_lagi_terdeteksi: "bg-status-neutral",
};

export const SeverityPill = ({ severity }: { severity: Severity }) => <Pill dot={SEVERITY[severity].dot}>{SEVERITY[severity].label}</Pill>;
export const ChangePill = ({ status }: { status: ChangeStatus }) => <Pill dot={CHANGE_DOT[status]}>{CHANGE_LABEL[status]}</Pill>;
export const KindPill = ({ kind }: { kind: Finding["kind"] }) => <Pill>{FINDING_KIND_LABEL[kind]}</Pill>;
