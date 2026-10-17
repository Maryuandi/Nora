import type { Role } from "./types";

export type UiAction = "client.create" | "project.create" | "project.status" | "member.manage" | "member.view" | "audit.view";

// Button matrix from PRD M01 "Matriks Kewenangan" (UI subset).
const ALLOWED: Record<UiAction, readonly Role[]> = {
  "client.create": ["administrator"],
  "project.create": ["administrator"],
  "project.status": ["administrator"],
  "member.manage": ["administrator"],
  "member.view": ["administrator", "analis", "pemilik_proses"],
  "audit.view": ["administrator", "analis", "pemilik_proses"],
};

export const can = (role: Role | null, action: UiAction): boolean => role !== null && ALLOWED[action].includes(role);
