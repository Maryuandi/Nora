import type { ProjectStatus, Role } from "./types";

export type UiAction = "client.create" | "project.create" | "project.status" | "member.manage" | "member.view" | "audit.view"
  | "source.view" | "source.create" | "snapshot.upload" | "snapshot.confirm" | "snapshot.cancel"
  | "mapping.view" | "mapping.edit"
  | "rule.view" | "rule.edit" | "rule.confirm"
  | "interpretation.view" | "interpretation.request" | "interpretation.override"
  | "investigation.view" | "investigation.create" | "investigation.link" | "investigation.status"
  | "note.add" | "note.add.field" | "comment.add" | "review.jev" | "review.draft"
  | "decision.analytic" | "decision.select" | "proposal.create"
  | "monitoring.view" | "monitoring.run" | "monitoring.configure"
  | "analysis.view"
  | "quality.view" | "repair.edit" | "dataset.publish"
  | "view.save";

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
  // M10a: only Analis requests drafts and overrides heuristic checks.
  "interpretation.view": ["administrator", "analis", "pemilik_proses"],
  "interpretation.request": ["analis"],
  "interpretation.override": ["analis"],
  // M11 (PRD assumption, not yet validated): analysts run the workspace; process owners add field notes, comment, propose and select.
  "investigation.view": ["administrator", "analis", "pemilik_proses"],
  "investigation.create": ["analis"],
  "investigation.link": ["analis"],
  "investigation.status": ["analis"],
  "note.add": ["analis"],
  "note.add.field": ["analis", "pemilik_proses"],
  "comment.add": ["analis", "pemilik_proses"],
  "review.jev": ["analis"],
  "review.draft": ["analis"],
  "decision.analytic": ["analis"],
  "decision.select": ["pemilik_proses"],
  "proposal.create": ["analis", "pemilik_proses"],
  "monitoring.view": ["administrator", "analis", "pemilik_proses"],
  "monitoring.run": ["analis"],
  "monitoring.configure": ["analis"],
  "analysis.view": ["administrator", "analis", "pemilik_proses"],
  "quality.view": ["administrator", "analis", "pemilik_proses"],
  "repair.edit": ["administrator", "analis"],
  "dataset.publish": ["analis"],
  // PRD M05: Analis and Administrator save views; Pemilik Proses only reads them.
  "view.save": ["administrator", "analis"],
};

export const can = (role: Role | null, action: UiAction): boolean => role !== null && ALLOWED[action].includes(role);

// Upload, add source and confirm are only offered while the project is active.
export const acceptsData = (status: ProjectStatus): boolean => status === "aktif";
