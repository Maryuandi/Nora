import { z } from "zod";

const required = (label: string) => z.string().trim().min(1, `${label} wajib diisi`);
const ROLES = ["administrator", "analis", "pemilik_proses"] as const;
const STATUSES = ["draft", "aktif", "ditangguhkan", "berakhir", "diarsipkan"] as const;

export const clientSchema = z.object({
  name: required("Nama klien"),
  sector: required("Sektor"),
  contact: required("Kontak"),
});

export const projectSchema = z
  .object({
    clientId: required("Klien"),
    name: required("Nama proyek"),
    description: z.string().trim(),
    processName: required("Nama proses"),
    startActivity: z.string().trim(),
    endActivity: z.string().trim(),
    contractStart: required("Tanggal mulai"),
    contractEnd: required("Tanggal selesai"),
    retention: required("Kebijakan retensi"),
  })
  .refine((v) => v.contractEnd >= v.contractStart, {
    path: ["contractEnd"],
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
  });

export const memberSchema = z.object({
  email: z.string().trim().pipe(z.email("Email tidak valid")),
  role: z.enum(ROLES),
});

export const statusChangeSchema = z.object({
  to: z.enum(STATUSES),
  reason: required("Alasan"),
});

export const activateSchema = z
  .object({
    password: z.string().min(12, "Minimal 12 karakter"),
    confirm: z.string(),
  })
  .refine((v) => v.confirm === v.password, { path: ["confirm"], message: "Konfirmasi tidak sama dengan kata sandi" });

export type ProjectInput = z.infer<typeof projectSchema>;
