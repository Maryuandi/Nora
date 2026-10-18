import { describeFilter, normalizeFilter, type FilterSpec } from "@/lib/mock/analysis";

/** Draft of the filter panel: every control as a string/array, turned into a FilterSpec on "Terapkan". */
export interface FilterForm {
  by: "mulai" | "akhir" | "event"; from: string; to: string;
  vendors: string[]; has: string[]; lacks: string[];
  minDays: string; maxDays: string; completion: "semua" | "selesai" | "berjalan"; po: string;
}
export const EMPTY_FORM: FilterForm = { by: "mulai", from: "", to: "", vendors: [], has: [], lacks: [], minDays: "", maxDays: "", completion: "semua", po: "" };

// Strict decimal ("." or ","): "0x10" / "1e3" become NaN so validateFilter reports them instead of silently dropping.
const days = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN;
};

/** `variantIds` has no control in the panel (set from the Varian page), so the applied ones are carried over. */
export function buildFilterFromForm(f: FilterForm, variantIds?: string[]): FilterSpec {
  const min = days(f.minDays), max = days(f.maxDays);
  return {
    ...(f.from.trim() || f.to.trim() ? { period: { by: f.by, from: f.from, to: f.to } } : {}),
    vendors: f.vendors, hasActivities: f.has, lacksActivities: f.lacks, ...(variantIds ? { variantIds } : {}),
    ...(min !== undefined || max !== undefined ? { duration: { minDays: min, maxDays: max } } : {}),
    completion: f.completion === "semua" ? undefined : f.completion, po: f.po,
  };
}

export function formFromFilter(spec: FilterSpec): FilterForm {
  const f = normalizeFilter(spec);
  return {
    by: f.period?.by ?? "mulai", from: f.period?.from ?? "", to: f.period?.to ?? "",
    vendors: f.vendors ?? [], has: f.hasActivities ?? [], lacks: f.lacksActivities ?? [],
    minDays: f.duration?.minDays !== undefined ? String(f.duration.minDays) : "", maxDays: f.duration?.maxDays !== undefined ? String(f.duration.maxDays) : "",
    completion: f.completion ?? "semua", po: f.po ?? "",
  };
}

export type ChipKey = keyof FilterSpec;
const ORDER: ChipKey[] = ["period", "vendors", "hasActivities", "lacksActivities", "variantIds", "duration", "completion", "po"];

/** One removable chip per active condition, worded by describeFilter. */
export function chipsOf(spec: FilterSpec): { key: ChipKey; text: string }[] {
  const f = normalizeFilter(spec);
  return ORDER.filter((k) => f[k] !== undefined).flatMap((key) => {
    const text = describeFilter({ [key]: f[key] })[0];
    return text ? [{ key, text }] : [];
  });
}
