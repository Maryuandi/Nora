import type { ProjectStatus, Role } from "./types";

export type UiAction = "client.create" | "project.create" | "project.status" | "member.manage" | "member.view" | "audit.view"
  | "source.view" | "source.create" | "snapshot.upload" | "snapshot.confirm" | "snapshot.cancel"
  | "mapping.view" | "mapping.edit"
  | "rule.view" | "rule.edit" | "rule.confirm"
  | "assessment.view" | "assessment.run" | "assessment.correct"
  | "classify.view" | "classify.run" | "classify.correct" | "gold.view" | "gold.edit"
  | "evaluation.view" | "evaluation.run" | "spec.view" | "spec.edit";

// Button matrix from PRD M01 "Matriks Kewenangan" (UI subset).
const ALLOWED: Record<UiAction, readonly Role[]> = {
  "client.create": ["administrator"],
  "project.create": ["administrator"],
  "project.status": ["administrator"],
  "member.manage": ["administrator"],
  "member.view": ["administrator", "analis", "pemilik_proses"],
  "audit.view": ["administrator", "analis", "pemilik_proses"],
  "source.view": ["administrator", "analis", "pemilik_proses"],
  "source.create": ["administrator", "analis"],
  "snapshot.upload": ["administrator", "analis"],
  "snapshot.confirm": ["administrator", "analis"],
  "snapshot.cancel": ["administrator", "analis"],
  "mapping.view": ["administrator", "analis", "pemilik_proses"],
  "mapping.edit": ["administrator", "analis"],
  // PRD M04: only Analis writes rules; only Pemilik Proses marks client confirmation.
  "rule.view": ["administrator", "analis", "pemilik_proses"],
  "rule.edit": ["analis"],
  "rule.confirm": ["pemilik_proses"],
  // PRD M08: only Analis runs assessments and corrects results; others read.
  "assessment.view": ["administrator", "analis", "pemilik_proses"],
  "assessment.run": ["analis"],
  "assessment.correct": ["analis"],
  // PRD M08 klasifikasi, set acuan, evaluasi, spesifikasi: same split (analis writes, all roles read).
  "classify.view": ["administrator", "analis", "pemilik_proses"],
  "classify.run": ["analis"],
  "classify.correct": ["analis"],
  "gold.view": ["administrator", "analis", "pemilik_proses"],
  "gold.edit": ["analis"],
  "evaluation.view": ["administrator", "analis", "pemilik_proses"],
  "evaluation.run": ["analis"],
  "spec.view": ["administrator", "analis", "pemilik_proses"],
  "spec.edit": ["analis"],
};

export const can = (role: Role | null, action: UiAction): boolean => role !== null && ALLOWED[action].includes(role);

// Upload, add source and confirm are only offered while the project is active.
export const acceptsData = (status: ProjectStatus): boolean => status === "aktif";
