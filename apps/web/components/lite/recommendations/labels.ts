import type { Tone } from "../badges";

export const VALIDATION: Record<string, { label: string; tone: Tone }> = {
  validated: { label: "Tervalidasi", tone: "active" }, needs_review: { label: "Perlu review", tone: "warning" },
  insufficient_information: { label: "Informasi tidak cukup", tone: "neutral" }, not_eligible: { label: "Tidak memenuhi syarat", tone: "error" },
  failed: { label: "Gagal", tone: "error" }, queued: { label: "Antre", tone: "info" }, validating: { label: "Memvalidasi", tone: "info" },
};

export const RELEVANCE_LABEL: Record<string, string> = { relevant: "Relevan", partly_relevant: "Sebagian relevan", not_relevant: "Tidak relevan", insufficient_information: "Informasi tidak cukup" };
