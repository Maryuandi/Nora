import type { ProjectStatus, Role } from "./types";

export type UiAction = "client.create" | "project.create" | "project.status" | "member.manage" | "member.view" | "audit.view"
  | "source.view" | "source.create" | "snapshot.upload" | "snapshot.confirm" | "snapshot.cancel"
  | "mapping.view" | "mapping.edit"
  | "rule.view" | "rule.edit" | "rule.confirm"
  | "doc.view" | "doc.upload" | "calendar.edit" | "config.view" | "config.edit" | "config.confirm";

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
  // PRD M04: Administrator and Analis upload documents and prepare the calendar; only Analis creates, approves and freezes the rest.
  "doc.view": ["administrator", "analis", "pemilik_proses"],
  "doc.upload": ["administrator", "analis"],
  "calendar.edit": ["administrator", "analis"],
  "config.view": ["administrator", "analis", "pemilik_proses"],
  "config.edit": ["analis"],
  "config.confirm": ["pemilik_proses"],
};

export const can = (role: Role | null, action: UiAction): boolean => role !== null && ALLOWED[action].includes(role);

// Upload, add source and confirm are only offered while the project is active.
export const acceptsData = (status: ProjectStatus): boolean => status === "aktif";
