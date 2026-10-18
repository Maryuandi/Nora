"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { NotFoundPanel } from "@/components/not-found-panel";
import { useAnalysis } from "@/components/project/analysis-filter";
import { CaseTimeline } from "@/components/project/case-timeline";
import { useProject } from "@/components/project/use-project";
import { caseById, filteredLogFor, validateFilter } from "@/lib/mock/analysis";

// decodeURIComponent throws on malformed escapes such as "%E0%A4%A": treat those as an unknown id.
const decode = (s: string): string | null => { try { return decodeURIComponent(s); } catch { return null; } };

export default function CaseTimelinePage() {
  const ctx = useProject();
  const { caseId } = useParams<{ caseId: string }>();
  const { filter } = useAnalysis();
  const id = decode(caseId);
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  if (!ctx) return null;
  const base = `/projects/${ctx.project.id}`;
  const back = { href: `${base}/analysis/cases`, label: "Kembali ke daftar kasus" };

  // Looked up in the unfiltered log: a case hidden by the current filter still opens.
  const kase = result && id !== null ? caseById(result.full, id) : undefined;
  if (!result || !kase) return <NotFoundPanel back={back} />;

  const order = result.filtered.cases;
  const at = order.findIndex((c) => c.id === kase.id);
  const neighbours = at < 0 ? null : { prev: order[at - 1]?.id, next: order[at + 1]?.id };

  return (
    <CaseTimeline key={kase.id} kase={kase} snapshot={result.snapshot} mapping={result.mapping} hasStartTime={result.hasStartTime}
      base={base} attrsAvailable={result.attrsAvailable} neighbours={neighbours} />
  );
}
