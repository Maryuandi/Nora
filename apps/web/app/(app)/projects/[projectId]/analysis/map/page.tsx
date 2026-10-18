"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Database } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { AnalysisTabs } from "@/components/project/analysis-tabs";
import { useAnalysis } from "@/components/project/analysis-filter";
import { CasePanel } from "@/components/project/case-panel";
import { EmptyFilterResult, FilterBar } from "@/components/project/filter-bar";
import { MapLegend } from "@/components/project/map-legend";
import { ProcessMap, type MapSelection } from "@/components/project/process-map";
import { useProject } from "@/components/project/use-project";
import { formatDuration } from "@/lib/format";
import { describeFilter, filteredLogFor, validateFilter } from "@/lib/mock/analysis";
import { END_ID, START_ID, casesForEdge, casesForNode, defaultSimplify, eventLogFor, simplify, type DfgEdge } from "@/lib/mock/eventlog";
import { layoutDfg } from "@/lib/mock/layout";
import { cx } from "@/utils/cx";

const isTerminal = (id: string) => id === START_ID || id === END_ID;

export default function ProcessMapPage() {
  return <Suspense><MapContent /></Suspense>;
}

function MapContent() {
  const ctx = useProject();
  const router = useRouter();
  const hl = useSearchParams().get("highlight");
  const highlight = useMemo(() => new Set(hl ? hl.split(",").filter(Boolean) : []), [hl]);
  const { filter, mode, setMode, selection: shared, setSelection, activityPct, transitionPct, setPct } = useAnalysis();
  // FilterBar never applies an invalid filter, but a loaded one could be: fall back to no filter.
  const effective = useMemo(() => (validateFilter(filter).length === 0 ? filter : {}), [filter]);
  const state = ctx?.state, projectId = ctx?.project.id;
  const full = useMemo(() => (state && projectId ? eventLogFor(state, projectId) : null), [state, projectId]);
  const result = useMemo(() => (state && projectId ? filteredLogFor(state, projectId, effective) : null), [state, projectId, effective]);
  const dfg = result?.dfg ?? null;
  const defaults = useMemo(() => (dfg ? defaultSimplify(dfg) : { activityPct: 100, transitionPct: 100 }), [dfg]);
  const pct = { activityPct: activityPct ?? defaults.activityPct, transitionPct: transitionPct ?? defaults.transitionPct };
  const selection = (shared?.kind === "node" || shared?.kind === "edge" ? shared : null) as MapSelection; // a variant selection belongs to the Kasus page
  const visible = useMemo(() => (dfg ? simplify(dfg, { activityPct: pct.activityPct, transitionPct: pct.transitionPct }) : null), [dfg, pct.activityPct, pct.transitionPct]);
  const positions = useMemo(() => (full ? layoutDfg(full.dfg) : null), [full]); // layout from the UNFILTERED dfg: filters and sliders never move nodes
  if (!ctx) return null;
  const { project } = ctx;
  const base = `/projects/${project.id}`;

  if (!result || !full || !dfg || !visible || !positions) {
    return (
      <div className="flex flex-col gap-4">
        <AnalysisTabs active="/analysis/map" />
        <h2 className="text-xl font-semibold">Peta proses</h2>
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Database size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada data untuk dipetakan</p>
            <p className="text-sm text-ink-3">Unggah data dan petakan kolomnya terlebih dahulu.</p>
            <Link href={`${base}/sources`} className="text-sm font-medium text-accent hover:underline">Buka sumber data</Link>
          </div>
        </Card>
      </div>
    );
  }

  const { filtered: log, sourceLabel, hasStartTime } = result;
  const total = full.log.cases.length;
  const filterHiddenActs = full.dfg.nodes.length - dfg.nodes.length, filterHiddenEdges = full.dfg.edges.length - dfg.edges.length;
  const label = (id: string) => dfg.nodes.find((n) => n.id === id)?.label ?? id;
  const edgeTitle = (e: DfgEdge) => `Transisi ${label(e.from)} → ${label(e.to)}`;

  // A selection whose element the sliders just hid is dropped, so the panel never describes something off the map.
  const node = selection?.kind === "node" ? visible.nodes.find((n) => n.id === selection.id) : undefined;
  const edge = selection?.kind === "edge" ? visible.edges.find((e) => e.id === selection.id) : undefined;
  const panel = node
    ? { key: `n:${node.id}`, title: isTerminal(node.id) ? "Semua kasus" : `Kasus yang melewati ${node.label}`, cases: casesForNode(log, node.id),
        note: !isTerminal(node.id) && node.eventCount !== node.caseCount ? `${node.eventCount.toLocaleString("id-ID")} event` : undefined }
    : edge
      ? { key: `e:${edge.id}`, title: edgeTitle(edge), cases: casesForEdge(log, edge.from, edge.to),
          note: edge.count !== edge.caseCount ? `${edge.count.toLocaleString("id-ID")} transisi` : undefined }
      : null;

  const inner = visible.edges.filter((e) => !isTerminal(e.from) && !isTerminal(e.to));
  const slowest = inner.reduce<DfgEdge | null>((m, e) => (!m || e.medianMs > m.medianMs ? e : m), null);
  const commonest = inner.reduce<DfgEdge | null>((m, e) => (!m || e.caseCount > m.caseCount ? e : m), null);
  const summary: { title: string; edge: DfgEdge | null; value: string }[] = [
    { title: "Transisi paling lambat", edge: slowest, value: slowest ? `median ${formatDuration(slowest.medianMs)}` : "" },
    { title: "Jalur paling sering", edge: commonest, value: commonest ? `${commonest.caseCount.toLocaleString("id-ID")} kasus` : "" },
  ];

  const header: [string, string][] = [
    ["Dataset", sourceLabel],
    ["Konteks", "Batas proses: awal/akhir teramati; paket konteks belum dipakai"],
    ["Filter", describeFilter(effective).join("; ") || "Tanpa filter"],
    ["Cakupan", `${log.cases.length.toLocaleString("id-ID")} kasus (${(total ? (log.cases.length * 100) / total : 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari data)`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <AnalysisTabs active="/analysis/map" />
      <h2 className="text-xl font-semibold">Peta proses</h2>
      <FilterBar attrsAvailable={result.attrsAvailable} activities={full.log.activities} />
      <Card>
        <dl className="grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {header.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-semibold text-ink-3">{k}</dt>
              <dd className="text-ink" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {log.cases.length === 0 ? <EmptyFilterResult /> : (
        <>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="group" aria-label="Mode peta">
            {([["frekuensi", "Frekuensi"], ["performa", "Performa"]] as const).map(([id, text]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
                className={cx("h-7 rounded-md px-3 text-sm", mode === id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
                {text}
              </button>
            ))}
          </div>
          {([["activityPct", "Aktivitas ditampilkan"], ["transitionPct", "Transisi ditampilkan"]] as const).map(([k, text]) => (
            <div key={k} className="flex flex-col gap-1 text-sm">
              <label htmlFor={`pct-${k}`} className="text-ink-2">{text}: <span className="font-medium text-ink">{pct[k]}%</span></label>
              <input id={`pct-${k}`} type="range" min={1} max={100} value={pct[k]} onChange={(e) => setPct({ ...pct, [k]: Number(e.target.value) })} className="w-44 accent-accent" />
            </div>
          ))}
          <Button color="secondary" size="xs" onClick={() => setPct(undefined)}>Atur ulang</Button>
          <p className="text-sm text-ink-2" data-testid="hidden-counts">{visible.hiddenActivities + filterHiddenActs} aktivitas dan {visible.hiddenTransitions + filterHiddenEdges} transisi disembunyikan</p>
        </div>

        {highlight.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <p title={[...highlight].join(", ")}>Disorot dari Monitoring › Model BPMN: {[...highlight].join(", ")}</p>
            <Button color="secondary" size="xs" onClick={() => router.replace(`${base}/analysis/map`)}>Hapus sorotan</Button>
          </div>
        )}

        <div>
          <ProcessMap highlight={highlight} dfg={dfg} positions={positions} visible={visible} mode={mode} selection={selection} onSelect={setSelection} hasStartTime={hasStartTime} />
          <MapLegend mode={mode} hasStartTime={hasStartTime} />
        </div>

        {panel && <CasePanel key={panel.key} title={panel.title} cases={panel.cases} note={panel.note} onClose={() => setSelection(null)} />}

        <div className="grid gap-4 sm:grid-cols-2">
          {summary.map(({ title, edge: e, value }) => (
            <Card key={title} className="p-4">
              <h3 className="text-xs font-semibold text-ink-3">{title}</h3>
              {e ? (
                <button type="button" onClick={() => setSelection({ kind: "edge", id: e.id })} className="mt-1 block w-full text-left hover:underline" title={`${label(e.from)} → ${label(e.to)}`}>
                  <span className="block truncate text-sm font-medium text-ink">{label(e.from)} → {label(e.to)}</span>
                  <span className="text-sm text-ink-2">{value}</span>
                </button>
              ) : (
                <p className="mt-1 text-sm text-ink-3">Tidak ada transisi terlihat</p>
              )}
            </Card>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
