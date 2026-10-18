// Formatting for /lite only; kept apart from lib/format.ts, which pulls in the mock dataset.

export const formatDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: d.length === 10 ? "UTC" : undefined }) : "–";

export const formatDateTime = (d: string | null | undefined, timeZone = "Asia/Jakarta") =>
  d ? new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }) : "–";

export const formatInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("id-ID"));

export const formatPct = (ratio: number | null | undefined, digits = 1) =>
  ratio == null || !Number.isFinite(ratio) ? "–" : `${(ratio * 100).toLocaleString("id-ID", { maximumFractionDigits: digits })}%`;

export const formatBytes = (n: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
};

/** Seconds as a compact Indonesian duration ("3,2 jam"). */
export const formatSeconds = (s: number | null | undefined): string => {
  if (s == null || !Number.isFinite(s) || s < 0) return "–";
  if (s < 60) return `${Math.round(s)} detik`;
  if (s < 3600) return `${Math.round(s / 60)} menit`;
  const compact = (n: number) => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString("id-ID");
  if (s < 86_400) return `${compact(s / 3600)} jam`;
  return `${compact(s / 86_400)} hari`;
};
