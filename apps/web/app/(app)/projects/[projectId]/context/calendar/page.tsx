"use client";

import { ContextTabs } from "@/components/project/context-tabs";
import { ConfigSection } from "@/components/project/config-section";

export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/calendar" />
      <ConfigSection kind="calendar" single editAction="calendar.edit" title="Kalender kerja" />
      <p className="text-xs text-ink-3">Satu kalender per proyek. Daftar hari libur diisi manual atau dari CSV; tidak diambil otomatis.</p>
    </div>
  );
}
