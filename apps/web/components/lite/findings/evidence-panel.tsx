"use client";

import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { formatDateTime } from "@/lib/lite/format";
import { cx } from "@/utils/cx";
import { StatePill } from "../badges";
import { useTRPC } from "@/lib/trpc/client";
import { errorText, toApiError } from "../api";
import { EvidenceContent, ITEM_LABEL, relationLabel } from "./evidence-labels";
import { CATEGORY } from "./finding-panels";
import { RELEVANCE_LABEL } from "../recommendations/labels";

type Cat = "lineage" | "observation" | "hypothesis" | "review";
interface GNode { type: string; id: string; label: string; props: Record<string, unknown> }
interface GEdge { type: string; category: Cat; from: string; to: string; props: Record<string, unknown> }
interface Neighborhood { nodes: GNode[]; edges: GEdge[]; available: boolean; status: { stale: boolean; pending: number; lagSeconds: number; projectedSequence: number } }

const STROKE: Record<Cat, { color: string; dash?: string }> = {
  lineage: { color: "#9a9ca8" }, observation: { color: "#2a9d78" }, hypothesis: { color: "#c88a00", dash: "6 4" }, review: { color: "#2f399f" },
};
const TYPE_LABEL: Record<string, string> = {
  Finding: "Temuan", Analysis: "Analisis", DatasetVersion: "Dataset", MappingVersion: "Mapping", Snapshot: "Snapshot", Source: "Sumber", ContextPackage: "Paket konteks",
  Rule: "Aturan", Document: "Dokumen", MetricDefinition: "Metrik", Transition: "Transisi", Activity: "Aktivitas", Variant: "Varian", CaseRef: "Kasus", Hypothesis: "Hipotesis",
  Intervention: "Intervensi", Rubric: "Rubrik", ProcessDefinition: "Batas proses", ReworkDefinition: "Rework", BpmnModel: "BPMN", BpmnTask: "Task BPMN", RepairRule: "Aturan perbaikan",
  EvidenceBundle: "Paket bukti", Assessment: "Penilaian", Interpretation: "Interpretasi", Candidate: "Kandidat", Comparison: "Perbandingan", Calendar: "Kalender",
};
const W = 190, H = 52;
/** Where the finding's numbers come from; laid out left of it. Everything else (assessments, interventions, bundles) goes right. */
const SOURCE_TYPES = new Set([
  "Analysis", "DatasetVersion", "MappingVersion", "Snapshot", "Source", "ContextPackage", "MetricDefinition", "Transition", "Activity", "Variant", "CaseRef",
  "Rule", "Document", "ProcessDefinition", "ReworkDefinition", "BpmnModel", "BpmnTask", "RepairRule", "Calendar",
]);

/** Projected labels predate the plain-language wording; reword the technical ones at display time. */
function nodeLabel(n: GNode): string {
  const p = n.props;
  if (n.type === "Analysis") return "Analisis proses";
  if (n.type === "Assessment") return `Penilaian Jev: ${RELEVANCE_LABEL[String(p.conclusion)] ?? (p.status === "needs_review" ? "perlu review" : String(p.status ?? "–"))}`;
  if (n.type === "EvidenceBundle") return p.purpose === "jev_assessment" ? "Paket untuk penilaian Jev" : "Paket untuk interpretasi LLM";
  return n.label;
}

function GraphNodeView({ data, selected }: NodeProps<Node<{ n: GNode; target: boolean }>>) {
  return (
    <div style={{ width: W, height: H }} className={cx("flex flex-col justify-center rounded-lg border bg-white px-2", data.target ? "border-accent ring-2 ring-accent/30" : "border-line", selected && "ring-2 ring-accent")}>
      {/* Both sides: an item left of the finding connects on its right, and vice versa. */}
      <Handle id="tl" type="target" position={Position.Left} isConnectable={false} className="!opacity-0" />
      <Handle id="sl" type="source" position={Position.Left} isConnectable={false} className="!opacity-0" />
      <span className="text-[10px] font-medium tracking-wide text-ink-3 uppercase">{TYPE_LABEL[data.n.type] ?? data.n.type}{data.n.props.superseded === true ? " · digantikan" : ""}</span>
      <span className="truncate text-xs font-medium text-ink" title={nodeLabel(data.n)}>{nodeLabel(data.n)}</span>
      <Handle id="tr" type="target" position={Position.Right} isConnectable={false} className="!opacity-0" />
      <Handle id="sr" type="source" position={Position.Right} isConnectable={false} className="!opacity-0" />
    </div>
  );
}

function CatEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<Edge<{ cat: Cat; label: string; show: boolean }>>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const s = STROKE[data!.cat];
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: s.color, strokeWidth: 1.5, strokeDasharray: s.dash }} />
      {data!.show && <EdgeLabelRenderer>
        <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }} className="pointer-events-none absolute rounded border border-line bg-white px-1 text-[11px] text-ink-2">
          {relationLabel(data!.label)}{data!.cat === "hypothesis" ? " · belum terbukti" : ""}
        </div>
      </EdgeLabelRenderer>}
    </>
  );
}

function GraphView({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [depth, setDepth] = useState(1); // depth 2 pulls in every activity of the run; opt in
  const q = useQuery(useTRPC().graph.neighborhood.queryOptions({ projectId, type: "Finding", id: findingId, depth }));
  const g: Neighborhood | undefined = q.data;
  const error = q.error ? errorText(toApiError(q.error)) : null;
  const flow = useMemo(() => {
    if (!g) return null;
    const dg = new dagre.graphlib.Graph();
    dg.setGraph({ rankdir: "LR", ranksep: 70, nodesep: 24 });
    dg.setDefaultEdgeLabel(() => ({}));
    const idx = new Map(g.nodes.map((n, i) => [`${n.type}:${n.id}`, `n${i}`]));
    g.nodes.forEach((n, i) => dg.setNode(`n${i}`, { width: W, height: H }));
    const edges = g.edges.filter((e) => idx.has(e.from) && idx.has(e.to)).map((e) => ({ e, s: idx.get(e.from)!, t: idx.get(e.to)! }));
    // Breadth-first from the finding: each direct neighbor picks a side by type, items further out follow the neighbor they hang off.
    // Layout edges then point away from the finding on the right and toward it on the left, so dagre ranks the two sides outward.
    const root = idx.get(`Finding:${findingId}`);
    const adj = new Map<string, string[]>();
    for (const { s, t } of edges) { adj.set(s, [...(adj.get(s) ?? []), t]); adj.set(t, [...(adj.get(t) ?? []), s]); }
    const left = new Set<string>(), seen = new Set(root ? [root] : []), queue = root ? [root] : [];
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v); queue.push(v);
        if (u === root ? SOURCE_TYPES.has(g.nodes[Number(v.slice(1))]!.type) : left.has(u)) left.add(v);
        if (left.has(v)) dg.setEdge(v, u); else dg.setEdge(u, v);
      }
    }
    dagre.layout(dg);
    const x = (id: string) => dg.node(id).x;
    return {
      nodes: g.nodes.map((n, i) => ({ id: `n${i}`, type: "g", position: { x: dg.node(`n${i}`).x - W / 2, y: dg.node(`n${i}`).y - H / 2 }, data: { n, target: n.type === "Finding" && n.id === findingId }, draggable: false })) as Node<{ n: GNode; target: boolean }>[],
      edges: edges.map(({ e, s, t }, i) => ({
        id: `e${i}`, source: s, target: t, type: "c", data: { cat: e.category, label: e.type, show: false },
        ...(x(s) <= x(t) ? { sourceHandle: "sr", targetHandle: "tl" } : { sourceHandle: "sl", targetHandle: "tr" }),
        markerEnd: { type: MarkerType.ArrowClosed, color: STROKE[e.category]?.color ?? "#999", width: 12, height: 12 },
      })) as Edge<{ cat: Cat; label: string; show: boolean }>[],
    };
  }, [g, findingId]);
  // Twenty overlapping relation labels are unreadable; label only the clicked item's edges.
  const edges = useMemo(() => flow?.edges.map((e) => ({ ...e, data: { ...e.data!, show: e.source === selId || e.target === selId } })), [flow, selId]);
  const sel = selId && g ? g.nodes[Number(selId.slice(1))] ?? null : null;
  if (error) return <p role="alert" className="text-sm text-error-primary">{error}</p>;
  if (!g || !flow) return <p className="text-sm text-ink-3" role="status">Memuat graph…</p>;
  if (!g.available || g.nodes.length === 0) return <p className="text-sm text-ink-2">Graph belum terproyeksi untuk temuan ini{g.status.pending ? ` (${g.status.pending} perubahan menunggu)` : ""}. Coba lagi beberapa saat lagi.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        Tampilkan
        {([[1, "hubungan langsung"], [2, "lebih luas"]] as const).map(([d, l]) => <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)} className={cx("rounded border px-2 py-0.5", depth === d ? "border-accent text-accent" : "border-line")}>{l}</button>)}
        <span className="text-ink-3">{g.nodes.length} item · {g.edges.length} hubungan · klik item untuk melihat hubungan dan isinya, geser untuk melihat semua</span>
      </div>
      <div className="h-[420px] rounded-lg border border-line" role="group" aria-label="Graph konteks temuan">
        <ReactFlowProvider>
          <ReactFlow nodes={flow.nodes.map((n) => ({ ...n, selected: n.id === selId }))} edges={edges} nodeTypes={{ g: GraphNodeView }} edgeTypes={{ c: CatEdge }} fitView fitViewOptions={{ minZoom: 0.75 }} minZoom={0.1}
            nodesDraggable={false} nodesConnectable={false} zoomOnScroll={false} preventScrolling={false} onNodeClick={(_, n) => setSelId(n.id)} onPaneClick={() => setSelId(null)}>
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      {sel && (
        <div className="rounded-lg border border-line bg-canvas px-3 py-2">
          <p className="mb-1 text-sm font-medium text-ink">{TYPE_LABEL[sel.type] ?? sel.type}: {nodeLabel(sel)}</p>
          <EvidenceContent type={sel.type} content={Object.fromEntries(Object.entries(sel.props).filter(([k]) => !["recordId", "creatorType", "projectId"].includes(k)).slice(0, 10))} />
        </div>
      )}
      <p className="text-xs text-ink-3">Diperbarui {formatDateTime(new Date().toISOString(), timezone)}{g.status.stale ? ` · ${g.status.pending} perubahan terbaru belum tampil` : ""}</p>
    </div>
  );
}

interface BundleRow { id: string; purpose: string; hash: string; contextLimited: boolean; contextMaybeStale: boolean; createdAt: string; included: number; excluded: number }
interface BundleItem { ordinal: number; itemType: string; itemId: string; itemVersion: string | null; relationPath: string; priority: number; included: boolean; exclusionReason: string | null; estimatedTokens: number; content: Record<string, unknown> | null }

const groupMetrics = (xs: BundleItem[]) =>
  xs.reduce<BundleItem[][]>((acc, x) => {
    const last = acc.at(-1);
    if (last && x.itemType === "metric_value" && last[0]!.itemType === "metric_value") last.push(x);
    else acc.push([x]);
    return acc;
  }, []);

function BundleView({ projectId, id }: { projectId: string; id: string }) {
  const b: { items: BundleItem[]; hash: string; graphSequence: number; contextLimited: boolean; contextMaybeStale: boolean } | undefined = useQuery(useTRPC().graph.bundle.queryOptions({ projectId, bundleId: id })).data;
  if (!b) return <p className="border-t border-line px-4 py-3 text-xs text-ink-3">Memuat paket…</p>;
  const included = b.items.filter((x) => x.included);
  const excluded = b.items.filter((x) => !x.included);
  return (
    <div className="flex flex-col gap-4 border-t border-line bg-canvas px-4 py-4">
      <ol className="flex flex-col gap-3">
        {/* Metric values are one line each; one card for all of them keeps the list short. */}
        {groupMetrics(included).map((xs) => (
          <li key={xs[0]!.ordinal} className="flex flex-col gap-1 rounded-md border border-line bg-white px-4 py-3">
            <p className="mb-1 text-xs font-medium tracking-wide text-ink-3 uppercase">{ITEM_LABEL[xs[0]!.itemType] ?? xs[0]!.itemType}</p>
            {xs.map((x) => x.content ? <EvidenceContent key={x.ordinal} type={x.itemType} content={x.content} /> : <p key={x.ordinal} className="text-sm text-ink-3">Tanpa isi.</p>)}
          </li>
        ))}
      </ol>
      {excluded.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-2">{excluded.length} item tidak dikirim ke model</summary>
          <ul className="mt-2 flex flex-col gap-1 pl-4">
            {excluded.map((x) => <li key={x.ordinal} className="text-ink-2">{ITEM_LABEL[x.itemType] ?? x.itemType} — <span className="text-ink-3">{x.exclusionReason}</span></li>)}
          </ul>
        </details>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Detail teknis</summary>
        <div className="mt-2 flex flex-col gap-2 pl-4 text-xs text-ink-3">
          <p>Hash {b.hash.slice(0, 16)} · versi graph {b.graphSequence}</p>
          <div className="overflow-x-auto rounded-md border border-line bg-white">
            <table className="w-full text-left [&_td]:px-3 [&_td]:py-1 [&_th]:px-3 [&_th]:py-1.5">
              <thead className="bg-sidebar"><tr><th className="font-medium">#</th><th className="font-medium">Jenis</th><th className="font-medium">ID</th><th className="font-medium">Versi</th><th className="font-medium">Jalur</th><th className="font-medium">Token</th></tr></thead>
              <tbody className="divide-y divide-line">
                {b.items.map((x) => <tr key={x.ordinal}><td>{x.ordinal}</td><td>{x.itemType}</td><td>{x.itemId.slice(0, 18)}</td><td>{x.itemVersion ?? "–"}</td><td>{x.relationPath}</td><td>{x.estimatedTokens}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

function Bundles({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery(useTRPC().graph.bundles.queryOptions({ projectId, targetId: findingId }));
  const rows: BundleRow[] | null = q.data?.bundles ?? (q.isError ? [] : null);
  if (!rows) return <p className="text-sm text-ink-3">Memuat…</p>;
  if (!rows.length) return <p className="text-sm text-ink-2">Belum ada paket bukti. Paket dibentuk otomatis saat penilaian Jev atau interpretasi diminta.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">Paket bukti adalah ringkasan data yang dikirim ke model AI saat menilai atau menjelaskan temuan ini. Model hanya melihat item di dalam paket; angka di dalamnya berasal dari hasil analisis, bukan dari model.</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="overflow-hidden rounded-lg border border-line">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left text-sm hover:bg-canvas" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span className="font-medium">{r.purpose === "jev_assessment" ? "Untuk penilaian Jev" : "Untuk interpretasi LLM"}</span>
              <span className="text-xs text-ink-3">{formatDateTime(r.createdAt, timezone)} · {r.included} item dikirim{r.excluded ? ` · ${r.excluded} tidak dikirim` : ""}</span>
              {r.contextLimited && <StatePill tone="warning" title="Sebagian item tidak muat dalam batas paket">Konteks terbatas</StatePill>}
              {r.contextMaybeStale && <StatePill tone="warning" title="Ada perubahan data yang belum masuk ke graph saat paket dibuat">Mungkin belum mutakhir</StatePill>}
              <span className="ml-auto text-xs text-accent">{open === r.id ? "Tutup" : "Lihat isi"}</span>
            </button>
            {open === r.id && <BundleView projectId={projectId} id={r.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidencePanel({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [tab, setTab] = useState<"graph" | "bundles">("graph");
  const stale = useQuery(useTRPC().findings.lineage.queryOptions({ projectId, findingId })).data?.graph ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tampilan bukti" className="flex rounded-lg border border-line p-0.5">
          {([["graph", "Peta hubungan"], ["bundles", "Paket bukti untuk AI"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cx("rounded-md px-3 py-1 text-xs font-medium", tab === k ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}>{l}</button>
          ))}
        </div>
        {stale?.stale && <StatePill tone="warning" title={`${stale.pending} perubahan belum tampil di peta hubungan`}>Peta belum mutakhir</StatePill>}
        <span className="ml-auto flex flex-wrap gap-1.5 text-[10px]">
          {(Object.keys(CATEGORY) as Cat[]).map((c) => <span key={c} className={cx("rounded border px-1.5", CATEGORY[c]!.className)}>{CATEGORY[c]!.label}</span>)}
        </span>
      </div>
      {tab === "graph" && <GraphView projectId={projectId} findingId={findingId} timezone={timezone} />}
      {tab === "bundles" && <Bundles projectId={projectId} findingId={findingId} timezone={timezone} />}
      {tab === "graph" && <p className="text-xs text-ink-3">Kiri: sumber angka temuan (analisis, data, kasus). Kanan: tindak lanjutnya (penilaian, intervensi, paket bukti). Garis menunjukkan keterkaitan, bukan sebab-akibat.</p>}
    </div>
  );
}
