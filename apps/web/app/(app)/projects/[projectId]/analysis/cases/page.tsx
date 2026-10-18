"use client";

import { useMemo } from "react";
import { X } from "@phosphor-icons/react";
import { Card } from "@/components/nora/card";
import { AnalysisTabs } from "@/components/project/analysis-tabs";
import { useAnalysis } from "@/components/project/analysis-filter";
import { CaseTable } from "@/components/project/case-table";
import { EmptyFilterResult, FilterBar, NoDataCard } from "@/components/project/filter-bar";
import { SaveViewButton } from "@/components/project/saved-view-dialog";
import { useProject } from "@/components/project/use-project";
import { casesForSelection, filteredLogFor, validateFilter, variantIdOf } from "@/lib/mock/analysis";
import { END_ID, START_ID, eventLogFor, type LogCase } from "@/lib/mock/eventlog";

const variantOf = (c: LogCase) => variantIdOf(c.events.map((e) => e.activity));

export default function CasesPage() {
  const ctx = useProject();
  const { filter, selection, setSelection } = useAnalysis();
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const full = useMemo(() => (state && projectId ? eventLogFor(state, projectId) : null), [state, projectId]);
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  const cases = useMemo(() => (result ? casesForSelection(result.filtered, result.dfg, selection) : []), [result, selection]);
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;

  if (!result || !full) {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisTabs active="/analysis/cases" />
        <h2 className="text-xl font-semibold">Kasus</h2>
        <NoDataCard base={base} />
      </div>
    );
  }

  const label = (id: string) => (id === START_ID ? "Mulai" : id === END_ID ? "Selesai" : (result.dfg.nodes.find((n) => n.id === id)?.label ?? id));
  const edge = selection?.kind === "edge" ? result.dfg.edges.find((e) => e.id === selection.id) : undefined;
  // Start/end nodes cover every case: no narrowing chip.
  const narrowed = !selection || (selection.kind === "node" && (selection.id === START_ID || selection.id === END_ID)) ? null
    : selection.kind === "variant" ? `Varian ${selection.id}`
    : selection.kind === "node" ? `Kasus yang melewati ${label(selection.id)}`
    : edge ? `Transisi ${label(edge.from)} → ${label(edge.to)}` : `Transisi ${selection.id}`;
  const total = result.filtered.cases.length;

  return (
    <div className="flex flex-col gap-4">
      <AnalysisTabs active="/analysis/cases" />
      <h2 className="text-xl font-semibold">Kasus</h2>
      <FilterBar attrsAvailable={result.attrsAvailable} activities={full.log.activities} />
      <SaveViewButton dfg={result.dfg} />
      {total === 0 ? <EmptyFilterResult /> : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <p className="text-sm text-ink-2" data-testid="case-count">{cases.length.toLocaleString("id-ID")} kasus{narrowed ? ` dari ${total.toLocaleString("id-ID")} kasus terfilter` : ""}</p>
            {narrowed && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-line bg-white py-0.5 pr-1 pl-3 text-sm text-ink" data-testid="narrow-chip">
                <span className="truncate" title={narrowed}>Dipersempit ke: {narrowed}</span>
                <button type="button" aria-label={`Hapus penyempitan ${narrowed}`} onClick={() => setSelection(null)}
                  className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-sidebar hover:text-ink">
                  <X size={12} aria-hidden />
                </button>
              </span>
            )}
          </div>
          {cases.length === 0 ? (
            <p className="border-t border-line px-4 py-8 text-center text-sm text-ink-3">Tidak ada kasus untuk pilihan ini pada filter yang berlaku.</p>
          ) : (
            <CaseTable key={`${selection?.kind}:${selection?.id}`} cases={cases} base={base} variantOf={variantOf} attrsAvailable={result.attrsAvailable} timezone={result.mapping.timezone} />
          )}
        </Card>
      )}
    </div>
  );
}
