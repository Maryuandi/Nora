import type { ProjectStatus } from "@nora/authz";

export type ReadinessState = "needs_source" | "needs_valid_snapshot" | "needs_dataset" | "needs_context" | "ready_to_analyze" | "results_ready";

export interface ReadinessFacts {
  sourceCount: number;
  readySnapshotCount: number;
  dataset: { id: string; name: string; publishedAt: string; qualityStatus: string } | null;
  context: { id: string; name: string; activatedAt: string; conformanceAvailable: boolean } | null;
  analysis: { id: string; completedAt: string } | null;
  findings: { bottleneck: number; rework: number };
}

export interface ReadinessComponentError {
  component: string;
  correlationId: string;
}

export type Section = "sources" | "context" | "analysis" | "findings";

export interface Readiness {
  state: ReadinessState;
  /** Conformance needs an active BPMN; analysis can still run without it. */
  conformanceUnavailable: boolean;
  facts: ReadinessFacts;
  cta: { label: string; section: Section | "activate" | null };
  errors: ReadinessComponentError[];
}

/** Deterministic: the same facts always give the same state and the same single CTA. */
export function computeState(f: ReadinessFacts): ReadinessState {
  if (f.sourceCount === 0) return "needs_source";
  if (f.readySnapshotCount === 0) return "needs_valid_snapshot";
  if (!f.dataset) return "needs_dataset";
  if (!f.context) return "needs_context";
  if (!f.analysis) return "ready_to_analyze";
  return "results_ready";
}

const CTA: Record<ReadinessState, { label: string; section: Section }> = {
  needs_source: { label: "Tambahkan sumber data", section: "sources" },
  needs_valid_snapshot: { label: "Unggah event log", section: "sources" },
  needs_dataset: { label: "Siapkan dan terbitkan dataset", section: "sources" },
  needs_context: { label: "Siapkan konteks proses", section: "context" },
  ready_to_analyze: { label: "Jalankan analisis", section: "analysis" },
  results_ready: { label: "Lihat temuan", section: "findings" },
};

export function computeReadiness(facts: ReadinessFacts, projectStatus: ProjectStatus, canActivate: boolean, errors: ReadinessComponentError[] = []): Readiness {
  const state = computeState(facts);
  let cta: Readiness["cta"] = CTA[state];
  // A failed dependency must not read as "not ready yet"; withhold the CTA instead of guessing.
  if (errors.length) cta = { label: "Muat ulang status", section: null };
  else if (projectStatus === "draft") cta = canActivate ? { label: "Aktifkan proyek", section: "activate" } : { label: "Menunggu aktivasi Administrator", section: null };
  else if (projectStatus !== "active" && state !== "results_ready") cta = { label: "Proyek hanya dapat dibaca", section: null };
  return { state, conformanceUnavailable: !facts.context?.conformanceAvailable, facts, cta, errors };
}
