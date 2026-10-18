import { MOCK_TODAY } from "./mock/data";

export const formatDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export const formatBytes = (n: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
};

export const daysSince = (iso: string, today = MOCK_TODAY): number => Math.floor((Date.parse(today) - Date.parse(iso)) / 86_400_000);

export const isStale = (iso: string, today?: string): boolean => daysSince(iso, today) > 30;

/** One decimal with Indonesian comma ("82,5"); "–" for null/non-finite so a missing score never shows NaN. */
export const formatScore = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** Probability 0..1 as a whole percent; non-finite counts as 0%. */
export const formatPercent = (p: number): string => `${Number.isFinite(p) ? Math.round(Math.max(0, Math.min(1, p)) * 100) : 0}%`;

/** Fixed `digits` decimals with Indonesian comma ("0,80"); "–" for null/non-finite. */
export const formatNumber = (n: number | null | undefined, digits: number): string =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
