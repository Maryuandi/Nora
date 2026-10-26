"use client";

import { useState } from "react";
import { CaseList, CaseTimeline, type CaseSort } from "../analysis/cases";

export function FindingCases({ projectId, findingId, datasetId, type, timezone }: { projectId: string; findingId: string; datasetId: string; type: string; timezone: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const first: CaseSort = type === "bottleneck_indication" ? { value: "support", label: "Tunggu transisi terlama" }
    : type === "high_rework" ? { value: "support", label: "Jumlah pengulangan" }
      : { value: "support", label: "Peringkat dukungan" };
  const sorts: CaseSort[] = [first, ...(type === "high_rework" ? [{ value: "additional", label: "Durasi tambahan" }] : []), { value: "duration", label: "Durasi kasus" }, { value: "events", label: "Jumlah event" }, { value: "start", label: "Waktu mulai" }];
  const support = type === "bottleneck_indication" ? { label: "Tunggu transisi", unit: "seconds" as const } : type === "high_rework" ? { label: "Pengulangan", unit: "count" as const } : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <CaseList projectId={projectId} source={{ findingId }} sorts={sorts} support={support} onOpen={setOpen} openUid={open} timezone={timezone} />
      {open && <CaseTimeline projectId={projectId} datasetId={datasetId} caseUid={open} timezone={timezone} onClose={() => setOpen(null)} />}
    </div>
  );
}

export const CATEGORY: Record<string, { label: string; className: string }> = {
  lineage: { label: "Asal data", className: "border-[#b8bcc8] text-ink-2" },
  observation: { label: "Terukur dari data", className: "border-status-active text-status-active" },
  hypothesis: { label: "Hipotesis · belum terbukti", className: "border-dashed border-status-suspended text-status-suspended" },
  review: { label: "Ditinjau manusia", className: "border-accent text-accent" },
};
