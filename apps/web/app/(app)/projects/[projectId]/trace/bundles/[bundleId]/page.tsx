"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Banner } from "@/components/nora/banner";
import { Pill } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { useProject } from "@/components/project/use-project";
import { BundleItemsTable } from "@/components/trace/bundle-items-table";
import { formatDateTime } from "@/lib/format";
import { buildGraph, bundleBudgetUsage, freshness } from "@/lib/mock/graph";
import { bundleById } from "@/lib/mock/reducer";
import { cx } from "@/utils/cx";

const PURPOSE_LABEL = { jev_assessment: "Penilaian Jev", llm_interpretation: "Interpretasi LLM" } as const;

function Meter({ label, used, limit, over }: { label: string; used: number; limit: number; over: boolean }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm"><span className="text-ink-2">{label}</span><span className="font-medium text-ink">{used}/{limit}{over && <span className="ml-2 text-xs font-medium text-ink-2">Melebihi anggaran</span>}</span></div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-valuetext={over ? `${used} dari ${limit}, melebihi anggaran` : `${used} dari ${limit}`} className="h-2 overflow-hidden rounded-full bg-sidebar">
        <div className={cx("h-full rounded-full", over ? "bg-status-suspended" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BundlePage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const ctx = useProject();
  const graph = useMemo(() => (ctx ? buildGraph(ctx.state, ctx.project.id) : null), [ctx?.state, ctx?.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx || !graph) return null;
  const { project, state } = ctx;
  const bundle = bundleById(state, project.id, bundleId);
  if (!bundle) return <NotFoundPanel />;

  const base = `/projects/${project.id}`;
  const usage = bundleBudgetUsage(bundle);
  const status = state.graphStatus[project.id];
  const stale = status ? freshness(status).stale : false;
  const target = graph.nodes.find((n) => n.id === bundle.target);
  const targetLabel = target?.label ?? bundle.target;
  const targetHref = target?.kind === "Finding" ? `${base}/trace/findings/${target.id}` : null;
  const assessment = graph.nodes.find((n) => n.id === bundle.assessmentId);
  const requester = state.users.find((u) => u.id === bundle.requestedBy)?.name ?? bundle.requestedBy;

  return (
    <div className="flex flex-col gap-4">
      <Link href={targetHref ?? `${base}/trace`} className="inline-flex items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> {targetHref ? "Jejak temuan" : "Jejak"}
      </Link>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Paket bukti</h2>
      {bundle.limitedContext && <Banner tone="warning">Konteks terbatas</Banner>}
      {stale && <Banner tone="warning">Konteks mungkin belum terbaru</Banner>}
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-line bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-ink-3">Target</dt><dd className="text-ink">{targetHref ? <Link href={targetHref} className="font-medium text-accent hover:underline">{targetLabel}</Link> : targetLabel}</dd></div>
        <div><dt className="text-xs text-ink-3">Tujuan</dt><dd className="text-ink">{PURPOSE_LABEL[bundle.purpose]}</dd></div>
        <div><dt className="text-xs text-ink-3">Diminta oleh</dt><dd className="text-ink">{requester}</dd></div>
        <div><dt className="text-xs text-ink-3">Waktu</dt><dd className="text-ink">{formatDateTime(bundle.at)}</dd></div>
        <div><dt className="text-xs text-ink-3">Hash</dt><dd className="font-mono text-ink">{bundle.hash}</dd></div>
        <div><dt className="text-xs text-ink-3">Penilaian</dt><dd className="text-ink">{assessment?.href ? <Link href={assessment.href} className="font-medium text-accent hover:underline">{assessment.label}</Link> : <span className="inline-flex items-center gap-2">{assessment?.label ?? bundle.assessmentId} <Pill>Modul belum tersedia</Pill></span>}</dd></div>
      </dl>
      <section aria-label="Anggaran" className="grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2">
        <Meter label="Item" used={usage.items} limit={bundle.budget.items} over={usage.overItems} />
        <Meter label="Token" used={usage.tokens} limit={bundle.budget.tokens} over={usage.overTokens} />
      </section>
      <BundleItemsTable bundle={bundle} graph={graph} />
    </div>
  );
}
