import { z } from "zod";
import { PROJECT_STATUSES, ROLES } from "@nora/authz";

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => text(max).min(1, `${label} wajib diisi`);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");

export const timeZoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Zona waktu tidak dikenal");

export const SetupInput = z.object({
  name: required(120, "Nama"),
  email: z.email("Email tidak valid").max(200),
  password: z.string().min(10, "Minimal 10 karakter").max(200),
});

export const LoginInput = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

export const ActivateInput = z.object({
  token: z.string().min(10).max(200),
  name: required(120, "Nama"),
  password: z.string().min(10, "Minimal 10 karakter").max(200),
});

export const ClientInput = z.object({
  name: required(160, "Nama klien"),
  sector: text(120).default(""),
  contact: text(200).default(""),
});

const projectFields = {
  name: required(160, "Nama proyek"),
  description: text(2000).default(""),
  processName: required(160, "Nama proses"),
  timezone: timeZoneSchema.default("Asia/Jakarta"),
  contractStart: isoDate,
  contractEnd: isoDate,
  retentionPolicy: required(300, "Kebijakan retensi"),
};
const contractOrder = (v: { contractStart?: string; contractEnd?: string }) => !v.contractStart || !v.contractEnd || v.contractEnd >= v.contractStart;
const contractIssue = { message: "Tanggal selesai tidak boleh sebelum tanggal mulai", path: ["contractEnd"] };

export const ProjectInput = z.object({ clientId: z.uuid("Pilih klien"), ...projectFields }).refine(contractOrder, contractIssue);
export const ProjectPatch = z.object(projectFields).partial().refine(contractOrder, contractIssue);

export const StatusInput = z.object({ status: z.enum(PROJECT_STATUSES), reason: text(500).default("") });

export const MemberInput = z.object({
  email: z.email("Email tidak valid").max(200),
  name: text(120).default(""),
  role: z.enum(ROLES),
});
