"use client";

import { useMemo, useState } from "react";
import type { ProcessMapResult } from "@nora/contracts";
import { formatInt, formatPct, formatSeconds } from "@/lib/lite/format";
import { cx } from "@/utils/cx";
import { CaseList, CaseTimeline } from "./cases";
import { FREQ_GRADIENT, isTerminal, layoutMap, PERF_GRADIENT, simplify } from "./map-model";
import { ProcessMap, type MapMode, type MapSelection } from "./process-map";

function Legend({ mode, hasStartTime }: { mode: MapMode; hasStartTime: boolean }) {
  const freq = mode === "frequency";
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-4 py-2 text-xs text-ink-2" aria-label="Legenda peta">
      <span className="flex items-center gap-2">{freq ? "Jarang" : "Cepat"}<span aria-hidden className="h-2 w-24 rounded-full" style={{ background: freq ? FREQ_GRADIENT : PERF_GRADIENT }} />{freq ? "Sering" : "Lambat"}</span>
      <span>Tebal garis sebanding dengan {freq ? "jumlah kasus" : "median tunggu"}.</span>
      <span>{freq ? "Angka pada garis: jumlah kasus." : "Angka pada garis: median tunggu antar waktu selesai event."}{!freq && !hasStartTime && " Tanpa waktu mulai, service time tidak dipisahkan."}</span>
      <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-5 rounded border border-accent/60" />Aktivitas batas proses</span>
    </div>
  );
}

export function MapView({ projectId, runId, datasetId, map, timezone }: { projectId: string; runId: string; datasetId: string; map: ProcessMapResult; timezone: string }) {
  const actCount = map.nodes.filter((n) => !isTerminal(n.id)).length;
  const big = actCount > 12 || map.edges.length > 30;
  const [mode, setMode] = useState<MapMode>("frequency");
  const [actPct, setActPct] = useState(big ? 85 : 100);
  const [edgePct, setEdgePct] = useState(big ? 85 : 100);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const positions = useMemo(() => layoutMap(map.nodes, map.edges), [map]);
  const visible = useMemo(() => simplify(map.nodes, map.edges, actPct, edgePct), [map, actPct, edgePct]);
  const selEdge = selection?.kind === "edge" ? map.edges.find((e) => e.id === selection.id) : undefined;
  const selNode = selection?.kind === "node" ? map.nodes.find((n) => n.id === selection.id) : undefined;
  const query = selEdge ? `from=${encodeURIComponent(selEdge.from)}&to=${encodeURIComponent(selEdge.to)}` : selNode ? `node=${encodeURIComponent(selNode.id)}` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-2.5">
          <div role="radiogroup" aria-label="Mode peta" className="flex rounded-lg border border-line p-0.5">
            {(["frequency", "performance"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={cx("rounded-md px-3 py-1 text-xs font-medium", mode === m ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}>
                {m === "frequency" ? "Frekuensi" : "Performa"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">Aktivitas <input type="range" min={10} max={100} step={5} value={actPct} onChange={(e) => setActPct(+e.target.value)} aria-valuetext={`${actPct}% event`} /> {actPct}%</label>
          <label className="flex items-center gap-2 text-xs text-ink-2">Transisi <input type="range" min={10} max={100} step={5} value={edgePct} onChange={(e) => setEdgePct(+e.target.value)} aria-valuetext={`${edgePct}% transisi`} /> {edgePct}%</label>
          {(visible.hiddenActivities > 0 || visible.hiddenTransitions > 0) && (
            <span className="text-xs text-status-suspended">Tersembunyi dari tampilan: {visible.hiddenActivities} aktivitas, {visible.hiddenTransitions} transisi (hasil analisis tidak berubah)</span>
          )}
        </div>
        <ProcessMap allNodes={map.nodes} allEdges={map.edges} positions={positions} nodes={visible.nodes} edges={visible.edges} mode={mode} selection={selection} onSelect={(s) => { setSelection(s); setOpenCase(null); }} />
        <Legend mode={mode} hasStartTime={map.hasStartTime} />
      </div>

      {query && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 shadow-card" aria-label="Kasus pada pilihan">
            <div>
              <h3 className="text-sm font-semibold">{selEdge ? `${label(selEdge.from)} → ${label(selEdge.to)}` : selNode?.label}</h3>
              <p className="text-xs text-ink-2">
                {selEdge ? `${formatInt(selEdge.caseCount)} kasus · ${formatInt(selEdge.count)} transisi · median ${formatSeconds(selEdge.medianSeconds)} · P90 ${formatSeconds(selEdge.p90Seconds)} · total ${formatSeconds(selEdge.totalSeconds)} (${formatPct(selEdge.contributionShare)} dari total tunggu)`
                  : selNode ? `${formatInt(selNode.caseCount)} kasus · ${formatInt(selNode.eventCount)} event · ${formatPct(selNode.caseShare)} kasus${selNode.serviceMedianSeconds != null ? ` · median service ${formatSeconds(selNode.serviceMedianSeconds)}` : ""}` : ""}
              </p>
            </div>
            <CaseList projectId={projectId} endpoint={`/analyses/${runId}/cases`} query={query} canSortByWait={!!selEdge && !isTerminal(selEdge.from) && !isTerminal(selEdge.to)} onOpen={setOpenCase} openUid={openCase} timezone={timezone} />
          </section>
          {openCase && <CaseTimeline projectId={projectId} datasetId={datasetId} caseUid={openCase} timezone={timezone} onClose={() => setOpenCase(null)} />}
        </div>
      )}

      <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
        <summary className="cursor-pointer text-sm font-semibold">Tabel alternatif peta</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <table className="w-full text-left text-sm">
            <caption className="pb-1 text-left text-xs text-ink-3">Aktivitas</caption>
            <thead className="text-xs text-ink-3"><tr><th className="py-1 font-medium">Aktivitas</th><th className="font-medium">Event</th><th className="font-medium">Kasus</th><th className="font-medium">Awal/akhir</th></tr></thead>
            <tbody className="divide-y divide-line">{map.nodes.filter((n) => !isTerminal(n.id)).map((n) => (
              <tr key={n.id}><td className="py-1"><button type="button" className="text-left text-accent hover:underline" onClick={() => setSelection({ kind: "node", id: n.id })}>{n.label}</button></td><td>{formatInt(n.eventCount)}</td><td>{formatInt(n.caseCount)}</td><td>{n.startCount}/{n.endCount}</td></tr>
            ))}</tbody>
          </table>
          <table className="w-full text-left text-sm">
            <caption className="pb-1 text-left text-xs text-ink-3">Transisi</caption>
            <thead className="text-xs text-ink-3"><tr><th className="py-1 font-medium">Dari → ke</th><th className="font-medium">Kasus</th><th className="font-medium">Median</th><th className="font-medium">P90</th></tr></thead>
            <tbody className="divide-y divide-line">{map.edges.filter((e) => !isTerminal(e.from) && !isTerminal(e.to)).map((e) => (
              <tr key={e.id}><td className="py-1"><button type="button" className="text-left text-accent hover:underline" onClick={() => setSelection({ kind: "edge", id: e.id })}>{e.from} → {e.to}</button></td><td>{formatInt(e.caseCount)}</td><td>{formatSeconds(e.medianSeconds)}</td><td>{formatSeconds(e.p90Seconds)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>

      {map.variants.length > 0 && (
        <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold">Advanced: varian ({map.variants.length})</summary>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-ink-3"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Urutan aktivitas</th><th className="font-medium">Kasus</th><th className="font-medium">Kumulatif</th><th className="font-medium">Median durasi</th></tr></thead>
            <tbody className="divide-y divide-line">{map.variants.slice(0, 50).map((v, i) => (
              <tr key={v.hash}><td className="py-1 text-ink-3">{i + 1}</td><td className="max-w-xl truncate" title={v.sequence.join(" → ")}>{v.sequence.join(" → ")}</td><td>{formatInt(v.caseCount)} ({formatPct(v.share)})</td><td>{formatPct(v.cumulativeShare)}</td><td>{formatSeconds(v.medianDurationSeconds)}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </div>
  );
}

const label = (id: string) => (id === "__start" ? "Mulai" : id === "__end" ? "Selesai" : id);
