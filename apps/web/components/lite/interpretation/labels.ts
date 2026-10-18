import type { Tone } from "../badges";

export const INTERPRETATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Antre", tone: "info" }, generating: { label: "Menyusun draft", tone: "info" }, checking: { label: "Diperiksa", tone: "info" },
  repairing: { label: "Diperbaiki", tone: "info" }, passed: { label: "Lolos pemeriksaan", tone: "active" }, failed_check: { label: "Gagal pemeriksaan", tone: "error" },
  failed: { label: "Gagal", tone: "error" }, accepted: { label: "Diterima", tone: "active" }, flagged: { label: "Ditandai bermasalah", tone: "warning" },
};
export const SECTION_LABEL: Record<string, string> = {
  summary: "Ringkasan", measured_facts: "Fakta terukur", evidence_basis: "Dasar bukti", interpretation: "Interpretasi",
  open_hypotheses: "Hipotesis terbuka", validated_recommendations: "Rekomendasi tervalidasi", follow_up: "Tindak lanjut",
};
export const CLAIM_TYPE: Record<string, { label: string; tone: Tone }> = {
  measured_fact: { label: "Fakta terukur", tone: "active" }, interpretation: { label: "Interpretasi", tone: "neutral" },
  hypothesis: { label: "Hipotesis", tone: "warning" }, validated_recommendation: { label: "Rekomendasi tervalidasi", tone: "info" },
};
export const AUDIENCE_LABEL: Record<string, string> = { analyst: "Analis", process_owner: "Pemilik proses" };
export const CHECK_LABEL: Record<string, string> = {
  schema: "Skema", placeholder: "Placeholder", numeric_literal: "Angka langsung", citation: "Sitasi", claim_type: "Tipe klaim",
  candidate: "Kandidat", unknown_action: "Tindakan tak dikenal", decision_language: "Bahasa keputusan", causal_language: "Bahasa kausal", uncertainty: "Ketidakpastian",
};
