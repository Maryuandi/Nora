"use client";

import { useMemo } from "react";
import { Card } from "@/components/nora/card";
import { AnalysisTabs } from "@/components/project/analysis-tabs";
import { useAnalysis } from "@/components/project/analysis-filter";
import { EmptyFilterResult, FilterBar, NoDataCard } from "@/components/project/filter-bar";
import { ObjectsBanner, ObjectsUnavailable, ObjectTable } from "@/components/project/object-table";
import { useProject } from "@/components/project/use-project";
import { filteredLogFor, objectGroups, validateFilter } from "@/lib/mock/analysis";

export default function ObjectsPage() {
  const ctx = useProject();
  const { filter } = useAnalysis();
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  const groups = useMemo(() => (result?.attrsAvailable ? objectGroups(result.filtered) : []), [result]);
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;

  const head = (
    <>
      <AnalysisTabs active="/analysis/objects" />
      <h2 className="text-xl font-semibold">Objek</h2>
      <ObjectsBanner />
    </>
  );

  if (!result) return <div className="flex flex-col gap-4">{head}<NoDataCard base={base} /></div>;
  if (!result.attrsAvailable) return <div className="flex flex-col gap-4">{head}<ObjectsUnavailable base={base} /></div>;

  return (
    <div className="flex flex-col gap-4">
      {head}
      <FilterBar attrsAvailable activities={result.full.activities} />
      {groups.length === 0 ? <EmptyFilterResult /> : (
        <Card>
          <p className="px-4 py-3 text-sm text-ink-2" data-testid="object-count">{groups.length.toLocaleString("id-ID")} objek dari {result.filtered.cases.length.toLocaleString("id-ID")} kasus terfilter</p>
          <ObjectTable key={`${result.snapshot.id}:${result.mapping.id}:${groups.length}`} groups={groups} base={base} timezone={result.mapping.timezone} />
        </Card>
      )}
    </div>
  );
}
