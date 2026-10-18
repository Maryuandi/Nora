"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { NotFoundPanel } from "@/components/not-found-panel";
import { Card } from "@/components/nora/card";
import { useAnalysis } from "@/components/project/analysis-filter";
import { NoDataCard } from "@/components/project/filter-bar";
import { ObjectsBanner, ObjectsUnavailable } from "@/components/project/object-table";
import { useProject } from "@/components/project/use-project";
import { formatEventTime, formatRange } from "@/lib/format";
import { filteredLogFor, groupCases, mergedTimeline, validateFilter, variantIdOf } from "@/lib/mock/analysis";

// decodeURIComponent throws on malformed escapes such as "%E0%A4%A": treat those as an unknown id.
const decode = (s: string): string | null => { try { return decodeURIComponent(s); } catch { return null; } };

// Fixed palette: a case keeps its colour by position in the object; the case ID is always written next to it.
const PALETTE = ["bg-blue-500", "bg-orange-500", "bg-emerald-600", "bg-purple-500", "bg-rose-500", "bg-cyan-600"] as const;

export default function ObjectDetailPage() {
  const ctx = useProject();
  const { objectId } = useParams<{ objectId: string }>();
  const { filter } = useAnalysis();
  const id = decode(objectId);
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  // Looked up in the unfiltered log: an object hidden by the current filter still opens.
  const cases = useMemo(() => (result && id !== null ? groupCases(result.full, id) : []), [result, id]);
  const rows = useMemo(() => mergedTimeline(cases), [cases]);
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;
  const listHref = `${base}/analysis/objects`;

  if (!result) return <div className="flex flex-col gap-4"><ObjectsBanner /><NoDataCard base={base} /></div>;
  if (!result.attrsAvailable) return <div className="flex flex-col gap-4"><ObjectsBanner /><ObjectsUnavailable base={base} /></div>;
  if (id === null || cases.length === 0) return <NotFoundPanel back={{ href: listHref, label: "Kembali ke daftar objek" }} />;

  const tz = result.mapping.timezone;
  const visible = new Set(result.filtered.cases.map((c) => c.id));
  const hidden = cases.filter((c) => !visible.has(c.id)).length;
  const variantIds = [...new Set(cases.map((c) => variantIdOf(c.events.map((e) => e.activity))))];
  const colour = new Map(cases.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]));
  const caseHref = (cid: string) => `${base}/analysis/cases/${encodeURIComponent(cid)}`;
  const field = (label: string, value: React.ReactNode, title?: string) => (
    <div className="min-w-0"><dt className="text-xs text-ink-3">{label}</dt><dd className="truncate text-sm text-ink" title={title}>{value}</dd></div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div><Button color="secondary" size="xs" iconLeading={List} href={listHref}>Kembali ke daftar objek</Button></div>
      <ObjectsBanner />
      {hidden > 0 && (
        <p className="text-sm text-ink-3" data-testid="hidden-note">
          {hidden === cases.length ? "Objek ini tidak termasuk dalam filter yang berlaku." : `${hidden} dari ${cases.length} kasus objek ini tidak termasuk dalam filter yang berlaku.`} Tampilan di bawah memuat semua kasusnya.
        </p>
      )}

      <Card>
        <div className="flex flex-col gap-3 px-4 py-4">
          <h2 className="min-w-0 truncate text-xl font-semibold" title={id}>{id}</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            {field("Kasus", cases.length)}
            {field("Rentang waktu", formatRange(Math.min(...cases.map((c) => c.startMs)), Math.max(...cases.map((c) => c.endMs)), tz))}
            {field("Varian", `${variantIds.length}: ${variantIds.join(", ")}`, variantIds.join(", "))}
          </dl>
        </div>
      </Card>

      <Card>
        <h3 className="px-4 pt-3 text-sm font-medium text-ink">Timeline gabungan ({rows.length} event)</h3>
        <ol aria-label="Timeline gabungan" className="divide-y divide-line">
          {rows.map(({ caseId, event, index }) => (
            <li key={`${caseId}:${index}`}>
              <Link href={caseHref(caseId)} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-sidebar">
                <span className={`size-3 shrink-0 rounded-full ${colour.get(caseId)}`} aria-hidden />
                <span className="w-24 shrink-0 truncate text-sm font-medium text-accent" title={caseId}>{caseId}</span>
                <span className="min-w-32 flex-1 truncate text-sm text-ink" title={event.activity}>{event.activity}</span>
                <span className="max-w-full text-sm text-ink-2">{formatEventTime(event.time, tz)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
