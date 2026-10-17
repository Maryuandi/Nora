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
