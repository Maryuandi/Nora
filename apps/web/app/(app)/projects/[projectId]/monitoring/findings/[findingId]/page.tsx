"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { ChangePill, KindPill, SeverityPill } from "@/components/project/finding-badges";
import { ProvenancePanel } from "@/components/project/provenance-panel";
import { useProject } from "@/components/project/use-project";
import { changesFor, fmtMeasure, resolveBaseline } from "@/lib/mock/finding-view";
import { findingsFor, type FindingKind } from "@/lib/mock/findings";

const METRIC: Record<FindingKind, string> = {
  bottleneck: "jeda_transisi", rework: "persen_rework", kepatuhan: "persen_kepatuhan",
  penyimpangan_model: "fitness", backlog: "umur_terbuka", tren_memburuk: "durasi_median",
};
const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export default function FindingDetailPage() {
  const { findingId } = useParams<{ findingId: string }>();
  let id = findingId;
  try { id = decodeURIComponent(findingId); } catch { /* malformed escape: keep raw param */ }
  return <Suspense><Detail id={id} /></Suspense>;
}

function Detail({ id }: { id: string }) {
  const ctx = useProject();
  const params = useSearchParams();
  if (!ctx) return <NotFoundPanel />;
  const { project, state } = ctx;
  // Run ids are a prefix of the finding id; baseline-only findings resolve through their own (baseline) run.
  const owner = state.runs.find((r) => r.projectId === project.id && id.startsWith(`${r.id}:`));
  const f = owner && findingsFor(state, owner).find((x) => x.id === id);
  if (!owner || !f) return <NotFoundPanel />;

  const wanted = state.runs.find((r) => r.projectId === project.id && r.id === params.get("run"));
  const view = wanted ?? owner;
  const change = changesFor(state, view, resolveBaseline(state, view, params.get("baseline"))).find((c) => c.finding.id === id);
  const share = f.populationCases ? (f.affectedCases / f.populationCases) * 100 : 0;
  const ratio = f.threshold === 0 || f.measure === 0 ? 1 : f.higherIsWorse ? f.measure / f.threshold : f.threshold / f.measure;
  const base = `/projects/${project.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`${base}/monitoring/findings?run=${view.id}${params.get("baseline") ? `&baseline=${encodeURIComponent(params.get("baseline")!)}` : ""}`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={14} aria-hidden />Temuan
        </Link>
        <h1 className="mt-2 text-[20px] leading-7 font-semibold tracking-[-0.02em]">{f.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <KindPill kind={f.kind} /><SeverityPill severity={f.severity} />{change && <ChangePill status={change.status} />}
          {change?.smallSample && <span className="text-xs text-ink-3">Sampel kecil</span>}
        </div>
      </div>

      <Card>
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["Ukuran sekarang", fmtMeasure(change?.status === "tidak_lagi_terdeteksi" ? null : f.measure, f.unit)],
            ["Ambang", fmtMeasure(f.threshold, f.unit)],
            ["Pembanding", fmtMeasure(change?.baselineMeasure ?? null, f.unit)],
            ["Kasus terdampak", `${nf.format(f.affectedCases)} dari ${nf.format(f.populationCases)}`],
          ] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-ink-3">{k}</dt><dd className="mt-0.5 text-sm text-ink">{v}</dd></div>
          ))}
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-ink-3">Keterangan keparahan</dt>
            <dd className="mt-0.5 text-sm text-ink">{nf.format(share)}% kasus terdampak × besaran penyimpangan {nf.format(ratio)}×</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">Kasus pendukung</h3>
          <Tooltip title="Workspace investigasi (M11) belum tersedia">
            <TooltipTrigger><Button color="secondary" size="xs" isDisabled>Tambah ke workspace investigasi</Button></TooltipTrigger>
          </Tooltip>
        </div>
        {f.supportingCaseIds.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-3">Tidak ada kasus pendukung</p>
        ) : (
          <Table aria-label="Kasus pendukung" size="sm">
            <Table.Header>
              <Table.Head id="id" isRowHeader label="ID KASUS" className="w-full" />
              <Table.Head id="act" label="AKSI" />
            </Table.Header>
            <Table.Body>
              {f.supportingCaseIds.map((c) => (
                <Table.Row key={c} id={c}>
                  <Table.Cell className="px-6 text-sm text-ink">{c}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap">
                    {f.caseSource === "log_event" ? (
                      <Link href={`${base}/analysis/map`} className="inline-flex items-center gap-1 text-accent hover:underline">Buka di peta proses<ArrowSquareOut size={14} aria-hidden /></Link>
                    ) : (
                      <Tooltip title="Penelusuran kasus (M05) belum tersedia">
                        <TooltipTrigger aria-label="Penelusuran kasus (M05) belum tersedia" className="cursor-not-allowed text-ink-3 opacity-50"><ArrowSquareOut size={14} aria-hidden /></TooltipTrigger>
                      </Tooltip>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      <ProvenancePanel run={owner} ruleKey={f.kind === "kepatuhan" ? f.key : undefined} metricId={METRIC[f.kind]} />
    </div>
  );
}
