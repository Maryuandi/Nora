"use client";

import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { useEffect, useMemo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { formatDateTime } from "@/lib/lite/format";
import { cx } from "@/utils/cx";
import { StatePill } from "../badges";
import { api, errorText } from "../api";
import { CATEGORY, LineagePanel } from "./finding-panels";

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

function GraphNodeView({ data, selected }: NodeProps<Node<{ n: GNode; target: boolean }>>) {
  return (
    <div style={{ width: W, height: H }} className={cx("flex flex-col justify-center rounded-lg border bg-white px-2", data.target ? "border-accent ring-2 ring-accent/30" : "border-line", selected && "ring-2 ring-accent")}>
      <Handle type="target" position={Position.Left} isConnectable={false} className="!opacity-0" />
      <span className="text-[10px] font-medium tracking-wide text-ink-3 uppercase">{TYPE_LABEL[data.n.type] ?? data.n.type}{data.n.props.superseded === true ? " · digantikan" : ""}</span>
      <span className="truncate text-xs font-medium text-ink" title={data.n.label}>{data.n.label}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!opacity-0" />
    </div>
  );
}

function CatEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<Edge<{ cat: Cat; label: string }>>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const s = STROKE[data!.cat];
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: s.color, strokeWidth: 1.5, strokeDasharray: s.dash }} />
      <EdgeLabelRenderer>
        <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }} className="pointer-events-none absolute rounded border border-line bg-white px-1 text-[9px] text-ink-2">
          {data!.label}{data!.cat === "hypothesis" ? " · belum terbukti" : ""}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function GraphView({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [g, setG] = useState<Neighborhood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<GNode | null>(null);
  const [depth, setDepth] = useState(1); // depth 2 pulls in every activity of the run; opt in
  useEffect(() => {
    setG(null);
    api<Neighborhood>(`/projects/${projectId}/graph/neighborhood?type=Finding&id=${findingId}&depth=${depth}`).then((r) => (r.ok ? setG(r.data) : setError(errorText(r.error))));
  }, [projectId, findingId, depth]);
  const flow = useMemo(() => {
    if (!g) return null;
    const dg = new dagre.graphlib.Graph();
    dg.setGraph({ rankdir: "LR", ranksep: 70, nodesep: 24 });
    dg.setDefaultEdgeLabel(() => ({}));
    const idx = new Map(g.nodes.map((n, i) => [`${n.type}:${n.id}`, `n${i}`]));
    g.nodes.forEach((n, i) => dg.setNode(`n${i}`, { width: W, height: H }));
    g.edges.forEach((e) => idx.has(e.from) && idx.has(e.to) && dg.setEdge(idx.get(e.from)!, idx.get(e.to)!));
    dagre.layout(dg);
    return {
      nodes: g.nodes.map((n, i) => ({ id: `n${i}`, type: "g", position: { x: dg.node(`n${i}`).x - W / 2, y: dg.node(`n${i}`).y - H / 2 }, data: { n, target: n.type === "Finding" && n.id === findingId }, draggable: false })) as Node<{ n: GNode; target: boolean }>[],
      edges: g.edges.filter((e) => idx.has(e.from) && idx.has(e.to)).map((e, i) => ({
        id: `e${i}`, source: idx.get(e.from)!, target: idx.get(e.to)!, type: "c", data: { cat: e.category, label: e.type },
        markerEnd: { type: MarkerType.ArrowClosed, color: STROKE[e.category]?.color ?? "#999", width: 12, height: 12 },
      })) as Edge<{ cat: Cat; label: string }>[],
    };
  }, [g, findingId]);
  if (error) return <p role="alert" className="text-sm text-error-primary">{error}</p>;
  if (!g || !flow) return <p className="text-sm text-ink-3" role="status">Memuat graph…</p>;
  if (!g.available || g.nodes.length === 0) return <p className="text-sm text-ink-2">Graph belum terproyeksi untuk temuan ini{g.status.pending ? ` (${g.status.pending} perubahan menunggu)` : ""}. Gunakan tampilan pohon, yang dibangun langsung dari data otoritatif.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        Kedalaman
        {[1, 2].map((d) => <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)} className={cx("rounded border px-2 py-0.5", depth === d ? "border-accent text-accent" : "border-line")}>{d}</button>)}
        <span className="text-ink-3">{g.nodes.length} node · {g.edges.length} relasi</span>
      </div>
      <div className="h-[420px] rounded-lg border border-line" role="group" aria-label="Graph konteks temuan">
        <ReactFlowProvider>
          <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={{ g: GraphNodeView }} edgeTypes={{ c: CatEdge }} fitView minZoom={0.1}
            nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, n) => setSel((n.data as { n: GNode }).n)} onPaneClick={() => setSel(null)} />
        </ReactFlowProvider>
      </div>
      {sel && (
        <div className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
          <p className="font-medium text-ink">{TYPE_LABEL[sel.type] ?? sel.type}: {sel.label}</p>
          <p className="text-ink-3">ID record {sel.id}</p>
          <dl className="mt-1 flex flex-wrap gap-x-4">{Object.entries(sel.props).slice(0, 8).map(([k, v]) => <div key={k}><dt className="inline text-ink-3">{k}: </dt><dd className="inline">{String(v).slice(0, 60)}</dd></div>)}</dl>
        </div>
      )}
      <p className="text-xs text-ink-3">Versi graph: sequence {g.status.projectedSequence}{g.status.stale ? ` · tertinggal ${g.status.lagSeconds} dtk` : ""} · {formatDateTime(new Date().toISOString(), timezone)}</p>
    </div>
  );
}

interface BundleRow { id: string; purpose: string; hash: string; contextLimited: boolean; contextMaybeStale: boolean; createdAt: string; included: number; excluded: number }
interface BundleItem { ordinal: number; itemType: string; itemId: string; itemVersion: string | null; relationPath: string; priority: number; included: boolean; exclusionReason: string | null; estimatedTokens: number; content: Record<string, unknown> | null }

function BundleView({ projectId, id }: { projectId: string; id: string }) {
  const [b, setB] = useState<{ items: BundleItem[]; hash: string; graphSequence: number; contextLimited: boolean; contextMaybeStale: boolean } | null>(null);
  useEffect(() => { api<typeof b>(`/projects/${projectId}/evidence-bundles/${id}`).then((r) => r.ok && setB(r.data)); }, [projectId, id]);
  if (!b) return <p className="text-xs text-ink-3">Memuat paket…</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <p className="mb-2 text-xs text-ink-3">Hash {b.hash.slice(0, 16)} · graph sequence {b.graphSequence}</p>
      <table className="w-full text-left text-xs">
        <thead className="text-ink-3"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Item</th><th className="font-medium">Versi</th><th className="font-medium">Jalur</th><th className="font-medium">Token</th><th className="font-medium">Status</th></tr></thead>
        <tbody className="divide-y divide-line">
          {b.items.map((x) => (
            <tr key={x.ordinal} className={x.included ? "" : "text-ink-3"}>
              <td className="py-1">{x.ordinal}</td>
              <td><details><summary className="cursor-pointer">{x.itemType} <span className="text-ink-3">{x.itemId.slice(0, 18)}</span></summary>{x.content && <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-canvas p-2 text-[11px] whitespace-pre-wrap">{JSON.stringify(x.content, null, 2).slice(0, 1500)}</pre>}</details></td>
              <td>{x.itemVersion ?? "–"}</td><td>{x.relationPath}</td><td>{x.estimatedTokens}</td>
              <td>{x.included ? <StatePill tone="active">Masuk</StatePill> : <span title={x.exclusionReason ?? ""}><StatePill tone="neutral">Dikecualikan</StatePill> {x.exclusionReason}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bundles({ projectId, findingId }: { projectId: string; findingId: string }) {
  const [rows, setRows] = useState<BundleRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<{ bundles: BundleRow[] }>(`/projects/${projectId}/evidence-bundles?targetId=${findingId}`).then((r) => setRows(r.ok ? r.data.bundles : [])); }, [projectId, findingId]);
  if (!rows) return <p className="text-sm text-ink-3">Memuat…</p>;
  if (!rows.length) return <p className="text-sm text-ink-2">Belum ada paket bukti. Paket dibentuk otomatis saat penilaian Jev atau interpretasi diminta.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-line px-3 py-2">
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left text-sm" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
            <span className="font-medium">{r.purpose === "jev_assessment" ? "Penilaian Jev" : "Interpretasi LLM"}</span>
            <span className="text-xs text-ink-3">{r.included} item masuk · {r.excluded} dikecualikan</span>
            {r.contextLimited && <StatePill tone="warning">Konteks terbatas</StatePill>}
            {r.contextMaybeStale && <StatePill tone="warning">Graph mungkin usang</StatePill>}
          </button>
          {open === r.id && <BundleView projectId={projectId} id={r.id} />}
        </li>
      ))}
    </ul>
  );
}

export function EvidencePanel({ projectId, findingId, timezone }: { projectId: string; findingId: string; timezone: string }) {
  const [tab, setTab] = useState<"tree" | "graph" | "bundles">("tree");
  const [stale, setStale] = useState<{ stale: boolean; pending: number } | null>(null);
  useEffect(() => { api<{ graph: { stale: boolean; pending: number } }>(`/projects/${projectId}/findings/${findingId}/lineage`).then((r) => r.ok && setStale(r.data.graph)); }, [projectId, findingId]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tampilan bukti" className="flex rounded-lg border border-line p-0.5">
          {([["tree", "Pohon"], ["graph", "Graph"], ["bundles", "Paket bukti"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cx("rounded-md px-3 py-1 text-xs font-medium", tab === k ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}>{l}</button>
          ))}
        </div>
        {stale?.stale && <StatePill tone="warning" title={`${stale.pending} perubahan belum terproyeksi`}>Graph tertinggal</StatePill>}
        <span className="ml-auto flex flex-wrap gap-1.5 text-[10px]">
          {(Object.keys(CATEGORY) as Cat[]).map((c) => <span key={c} className={cx("rounded border px-1.5", CATEGORY[c]!.className)}>{CATEGORY[c]!.label}</span>)}
        </span>
      </div>
      {tab === "tree" && <LineagePanel projectId={projectId} findingId={findingId} timezone={timezone} />}
      {tab === "graph" && <GraphView projectId={projectId} findingId={findingId} timezone={timezone} />}
      {tab === "bundles" && <Bundles projectId={projectId} findingId={findingId} />}
      {tab !== "tree" && <p className="text-xs text-ink-3">Graph adalah proyeksi turunan dari data otoritatif dan bukan bukti hubungan sebab-akibat.</p>}
    </div>
  );
}
