import { StatePill, type Tone } from "../badges";

const SNAPSHOT: Record<string, { label: string; tone: Tone }> = {
  awaiting_upload: { label: "Menunggu unggahan", tone: "neutral" },
  validating: { label: "Memvalidasi", tone: "info" },
  ready_for_mapping: { label: "Siap dipetakan", tone: "active" },
  needs_review: { label: "Perlu ditinjau", tone: "warning" },
  failed: { label: "Gagal", tone: "error" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
};

const DATASET: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  processing: { label: "Diproses", tone: "info" },
  quality_review: { label: "Tinjauan kualitas", tone: "warning" },
  published: { label: "Terbit", tone: "active" },
  superseded: { label: "Digantikan", tone: "neutral" },
  failed: { label: "Gagal", tone: "error" },
};

const QUALITY: Record<string, { label: string; tone: Tone }> = {
  ready: { label: "Siap", tone: "active" },
  ready_with_notes: { label: "Siap dengan catatan", tone: "warning" },
  not_ready: { label: "Belum siap", tone: "error" },
};

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  high: { label: "Tinggi", tone: "error" },
  medium: { label: "Sedang", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

const pill = (map: Record<string, { label: string; tone: Tone }>, k: string | null | undefined) => {
  const m = (k && map[k]) || { label: k ?? "–", tone: "neutral" as Tone };
  return <StatePill tone={m.tone}>{m.label}</StatePill>;
};

export const SnapshotStatus = ({ status }: { status: string }) => pill(SNAPSHOT, status);
export const DatasetStatus = ({ status }: { status: string }) => pill(DATASET, status);
export const QualityStatus = ({ status }: { status: string | null }) => pill(QUALITY, status);
export const SeverityBadge = ({ severity }: { severity: string }) => pill(SEVERITY, severity);
