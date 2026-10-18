"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/utils/cx";
import { formatDateTime } from "@/lib/lite/format";
import { api, errorText } from "../api";
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
      <CaseList projectId={projectId} endpoint={`/findings/${findingId}/cases`} query="" sorts={sorts} support={support} onOpen={setOpen} openUid={open} timezone={timezone} />
      {open && <CaseTimeline projectId={projectId} datasetId={datasetId} caseUid={open} timezone={timezone} onClose={() => setOpen(null)} />}
    </div>
  );
}

export interface LineageNode {
  id: string; type: string; label: string; detail?: string; version?: string | number | null; status?: string | null; superseded?: boolean; href?: string;
  relation?: string; category?: "lineage" | "observation" | "hypothesis" | "review"; creator?: string; recordId?: string; at?: string | null; children: LineageNode[];
}

export const CATEGORY: Record<string, { label: string; className: string }> = {
  lineage: { label: "Lineage", className: "border-[#b8bcc8] text-ink-2" },
  observation: { label: "Observasi", className: "border-status-active text-status-active" },
  hypothesis: { label: "Hipotesis · belum terbukti", className: "border-dashed border-status-suspended text-status-suspended" },
  review: { label: "Review", className: "border-accent text-accent" },
};

function Node({ n, depth, timezone }: { n: LineageNode; depth: number; timezone: string }) {
  const cat = n.category ? CATEGORY[n.category] : undefined;
  return (
    <li className={cx("relative", depth > 0 && "border-l border-line pl-4")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
        {n.relation && <span className={cx("rounded border px-1.5 text-[10px] font-medium tracking-wide", cat?.className)}>{n.relation}</span>}
        {n.href ? <Link href={n.href} className="text-sm font-medium text-ink hover:text-accent">{n.label}</Link> : <span className="text-sm font-medium">{n.label}</span>}
        {n.version != null && <span className="text-xs text-ink-3">v{n.version}</span>}
        {n.superseded && <span className="rounded bg-sidebar px-1.5 text-[11px] text-ink-2">digantikan</span>}
        {n.creator && <span className="text-[11px] text-ink-3">· {n.creator === "code" ? "kode" : n.creator === "model" ? "model" : "manusia"}</span>}
        {n.at && <span className="text-[11px] text-ink-3">· {formatDateTime(n.at, timezone)}</span>}
      </div>
      {n.detail && <p className="mb-1 max-w-3xl truncate text-xs text-ink-2" title={n.detail}>{n.detail}</p>}
      {n.children.length > 0 && <ul className="ml-1">{n.children.map((c) => <Node key={c.id} n={c} depth={depth + 1} timezone={timezone} />)}</ul>}
    </li>
  );
}

/** Lineage tree by default; loads on its own so a slow or failing panel never blocks the finding. */
export function LineagePanel({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [tree, setTree] = useState<LineageNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ tree: LineageNode }>(`/projects/${projectId}/findings/${findingId}/lineage`).then((r) => (r.ok ? setTree(r.data.tree) : setError(errorText(r.error))));
  }, [projectId, findingId]);
  if (error) return <p role="alert" className="text-sm text-error-primary">Jejak bukti gagal dimuat: {error}</p>;
  if (!tree) return <p className="text-sm text-ink-3" role="status">Memuat jejak bukti…</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-3">Jejak ini menunjukkan asal angka, bukan bukti hubungan sebab-akibat.</p>
      <ul><Node n={tree} depth={0} timezone={timezone} /></ul>
    </div>
  );
}
