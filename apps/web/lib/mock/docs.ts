import { isDate } from "./rules";
import type { ContextDoc, DocKind } from "./types";

export const DOC_KIND_LABEL: Record<DocKind, string> = { sop: "SOP", bpmn: "Model BPMN", sla: "Perjanjian SLA", wawancara: "Catatan wawancara" };
export const DOC_EXTENSIONS = [".pdf", ".docx", ".md", ".txt", ".bpmn"] as const;
export const DOC_MAX_BYTES = 50 * 1024 * 1024;

export type DocInput = {
  title: string; kind: DocKind; issuer: string; docDate: string; effectiveFrom: string | null;
  fileName: string | null; sizeBytes: number; text?: string;
};

export function validateDoc(input: DocInput): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });
  if (!input.title.trim()) err("title", "Judul wajib diisi");
  if (!input.issuer.trim()) err("issuer", "Pemberi dokumen wajib diisi");
  if (!isDate(input.docDate)) err("docDate", "Tanggal dokumen tidak valid (YYYY-MM-DD)");
  if (input.effectiveFrom != null && !isDate(input.effectiveFrom)) err("effectiveFrom", "Tanggal berlaku tidak valid (YYYY-MM-DD)");
  if (input.kind === "wawancara") {
    if (!input.text?.trim()) err("text", "Isi catatan wawancara wajib diisi");
  } else if (!input.fileName) {
    err("file", "Pilih file terlebih dahulu");
  } else {
    const name = input.fileName.toLowerCase();
    if (!DOC_EXTENSIONS.some((e) => name.endsWith(e))) err("file", "Format harus PDF, DOCX, MD, TXT, atau BPMN");
    if (input.sizeBytes > DOC_MAX_BYTES) err("file", "Ukuran file melebihi 50 MB");
  }
  return errors;
}

/** Newest version of each docKey first (ties: later index first). */
export function latestDocs(docs: ContextDoc[]): ContextDoc[] {
  const best = new Map<string, ContextDoc>();
  for (const d of docs) {
    const cur = best.get(d.docKey);
    if (!cur || d.version >= cur.version) best.set(d.docKey, d);
  }
  return docs.map((x, i) => ({ x, i })).filter(({ x }) => best.get(x.docKey) === x).sort((a, b) => b.x.uploadedAt.localeCompare(a.x.uploadedAt) || b.i - a.i).map(({ x }) => x);
}
