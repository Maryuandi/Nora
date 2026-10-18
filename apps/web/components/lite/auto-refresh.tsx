"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders server data while a background job runs; stops as soon as `active` turns false. */
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
