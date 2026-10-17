"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { NotFoundPanel } from "@/components/not-found-panel";
import { useProject } from "@/components/project/use-project";
import { CategoryFilter } from "@/components/trace/category-filter";
import { LineageList } from "@/components/trace/lineage-list";
import { NodePanel } from "@/components/trace/node-panel";
import { StaleBadge } from "@/components/trace/stale-badge";
import { TraceNotice } from "@/components/trace/trace-notice";
import { TraceTabs } from "@/components/trace/trace-tabs";
import { RELATION_META, buildGraph, lineage } from "@/lib/mock/graph";
import type { RelationCategory } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const GraphCanvas = dynamic(() => import("@/components/trace/graph-canvas"), {
  ssr: false,
  loading: () => <div role="status" className="flex h-[520px] items-center justify-center rounded-lg border border-line bg-white text-sm text-ink-3">Memuat graf…</div>,
});

export default function FindingTracePage() {
  const { findingId } = useParams<{ findingId: string }>();
  const ctx = useProject();
  const [view, setView] = useState<"daftar" | "graf">("daftar");
  const [filter, setFilter] = useState<Set<RelationCategory>>(() => new Set(Object.keys(RELATION_META) as RelationCategory[]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useMemo(() => (ctx ? buildGraph(ctx.state, ctx.project.id) : null), [ctx?.state, ctx?.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useMemo(() => (graph ? lineage(graph, findingId) : null), [graph, findingId]);
  useEffect(() => setSelectedId(null), [findingId]);
  if (!ctx || !graph) return null;
  const { project, state } = ctx;
  const finding = state.traceFindings.find((f) => f.id === findingId && f.projectId === project.id);
  if (!finding || !result) return <NotFoundPanel />;
  // Look up within this finding's lineage so an id left over from another finding can never show.
  const bundles = state.bundles.filter((b) => b.projectId === project.id && b.target === finding.id);
  const present = (Object.keys(RELATION_META) as RelationCategory[]).filter((c) => result.edges.some((e) => e.category === c));
  const selected = result.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <TraceTabs active="/trace" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{finding.title}</h2>
          <p className="text-sm text-ink-3">{finding.metric}: {finding.value}</p>
          {bundles.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
              {bundles.map((b, i) => <Link key={b.id} href={`/projects/${project.id}/trace/bundles/${b.id}`} className="font-medium text-accent hover:underline">Paket bukti{bundles.length > 1 ? ` ${i + 1}` : ""}</Link>)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StaleBadge status={state.graphStatus[project.id]} />
          <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="group" aria-label="Tampilan">
            {([["daftar", "Daftar"], ["graf", "Graf"]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                className={cx("rounded-md px-3 py-1 text-sm", view === id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <TraceNotice />
      {view === "graf" && <CategoryFilter value={filter} onChange={setFilter} categories={present} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {view === "daftar"
          ? <LineageList result={result} graph={graph} onSelect={(n) => setSelectedId(n.id)} />
          : <GraphCanvas result={result} filter={filter} selectedId={selectedId} onSelect={setSelectedId} />}
        {selected && <NodePanel graph={graph} node={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}
