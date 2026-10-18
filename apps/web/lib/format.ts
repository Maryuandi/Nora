import { MOCK_TODAY } from "./mock/data";

export const formatDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Event wall-clock time in the mapping's IANA zone, with zone label (e.g. "GMT+7"). Bad zone falls back to UTC; bad date gives "-". */
export const formatEventTime = (iso: string, timeZone: string): string => {
  if (!Number.isFinite(Date.parse(iso))) return "-";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" };
  try { return new Date(iso).toLocaleString("id-ID", { ...opts, timeZone }); } catch { return new Date(iso).toLocaleString("id-ID", { ...opts, timeZone: "UTC" }); }
};

export const formatBytes = (n: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
};

export const daysSince = (iso: string, today = MOCK_TODAY): number => Math.floor((Date.parse(today) - Date.parse(iso)) / 86_400_000);

export const isStale = (iso: string, today?: string): boolean => daysSince(iso, today) > 30;

// One decimal only below 10; the rounded value (not the raw one) decides the unit so 59.99 min -> "1 jam".
const compactNumber = (n: number): number => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));
const show = (n: number): string => n.toLocaleString("id-ID");

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 60_000) return "< 1 menit";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = compactNumber(ms / 3_600_000);
  if (hours < 24) return `${show(hours)} jam`;
  return `${show(compactNumber(ms / 86_400_000))} hari`;
};

/** "from - to" on the mapping's time zone; "-" when either bound is not a finite ms value. */
export const formatRange = (fromMs: number, toMs: number, tz: string): string =>
  Number.isFinite(fromMs) && Number.isFinite(toMs) ? `${formatEventTime(new Date(fromMs).toISOString(), tz)} - ${formatEventTime(new Date(toMs).toISOString(), tz)}` : "-";
/** One decimal with Indonesian comma ("82,5"); "–" for null/non-finite so a missing score never shows NaN. */
export const formatScore = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** Probability 0..1 as a whole percent; non-finite counts as 0%. */
export const formatPercent = (p: number): string => `${Number.isFinite(p) ? Math.round(Math.max(0, Math.min(1, p)) * 100) : 0}%`;

/** Fixed `digits` decimals with Indonesian comma ("0,80"); "–" for null/non-finite. */
export const formatNumber = (n: number | null | undefined, digits: number): string =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Ratio 0..1 as a percent with up to one decimal ("83,3%"); "–" for null/non-finite. */
export const formatRatioPct = (p: number | null | undefined): string => (p == null || !Number.isFinite(p) ? "–" : `${formatScore(p * 100)}%`);
