"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Table } from "@/components/application/table/table";
import { Banner } from "@/components/nora/banner";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { AssessmentTabs } from "@/components/project/assessment-tabs";
import { ClassCorrectionModal } from "@/components/project/class-correction-modal";
import { ClassStatusBadge } from "@/components/project/assessment-status";
import { useProject } from "@/components/project/use-project";
import { formatPercent } from "@/lib/format";
import { CLASS_STATUS_LABEL, classSummary, currentClassResults, effectiveClass, noteAggregation, topTwoOf } from "@/lib/mock/classification";
import { acceptsData } from "@/lib/mock/permissions";
import { activeSpec, isStale } from "@/lib/mock/specs";
import type { ClassStatus } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

type Task = "aktivitas" | "catatan";
const TASK_LABEL: Record<Task, string> = { aktivitas: "Aktivitas", catatan: "Catatan" };
const FILTER_ITEMS = [{ id: "semua", label: "Semua" }, ...(Object.keys(CLASS_STATUS_LABEL) as ClassStatus[]).map((id) => ({ id, label: CLASS_STATUS_LABEL[id] }))];

const Trunc = ({ text, className }: { text: string; className?: string }) => (
  <span title={text} className={cx("block max-w-[16rem] truncate", className)}>{text}</span>
);

export function ClassificationView({ task }: { task: Task }) {
  const ctx = useProject();
  const [filter, setFilter] = useState("semua");
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return <NotFoundPanel />;
  const { project, state, can, dispatch } = ctx;
  const base = `/projects/${project.id}/assessments/classification`;
  const open = acceptsData(project.status);
  const mayRun = can("classify.run", project.id);
  const mayCorrect = can("classify.correct", project.id) && open;

  const spec = activeSpec(state, project.id, task);
  const order = spec?.categories.map((c) => c.key) ?? [];
  const labelOf = (k: string) => spec?.categories.find((c) => c.key === k)?.label ?? k;
  const items = state.classItems.filter((i) => i.projectId === project.id && i.task === task);
  const current = currentClassResults(state, project.id, task);
  const resultOf = (itemId: string) => current.find((r) => r.itemId === itemId);
  const { byCategory, unscored } = classSummary(state, project.id, task, order);
  const correctedCount = current.filter((r) => state.classCorrections.some((c) => c.resultId === r.id && !c.confirmedOnly)).length;
  const agg = task === "catatan" ? noteAggregation(state, project.id) : undefined;
  const aggKeys = [...order, ...[...(agg?.rows ?? []), ...(agg?.periods ?? [])].flatMap((g) => Object.keys(g.counts)).filter((k, i, a) => !order.includes(k) && a.indexOf(k) === i)];
  const summaryKeys = [...order, ...Object.keys(byCategory).filter((k) => !order.includes(k))];
  const counted = summaryKeys.reduce((a, k) => a + (byCategory[k] ?? 0), 0);

  const rows = items.filter((i) => {
    const r = resultOf(i.id);
    return filter === "semua" || r?.status === filter;
  });
  const correcting = current.find((r) => r.id === correctingId);
  const correctingItem = correcting && items.find((i) => i.id === correcting.itemId);

  const run = (scope: "belum_dinilai" | "semua") => { setError(dispatch({ type: "runClassification", projectId: project.id, task, scope })); setConfirmAll(false); };

  return (
    <div className="flex flex-col gap-4">
      <AssessmentTabs active="klasifikasi" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Klasifikasi</h2>
          {spec && <p title={spec.question} className="text-sm text-ink-2">{spec.question} · spesifikasi v{spec.version}</p>}
        </div>
        {mayRun && open && (
          <Button color="primary" size="xs" onClick={() => (unscored > 0 ? run("belum_dinilai") : setConfirmAll(true))}>
            {unscored > 0 ? "Jalankan klasifikasi" : "Ulangi semua"}
          </Button>
        )}
      </div>
      <nav aria-label="Tugas" className="flex gap-2">
        {(Object.keys(TASK_LABEL) as Task[]).map((t) => (
          <Link key={t} href={`${base}?task=${t}`} aria-current={t === task ? "page" : undefined}
            className={cx("rounded-md border px-3 py-1 text-sm", t === task ? "border-accent bg-canvas font-medium text-ink" : "border-line text-ink-2 hover:text-ink")}>
            {TASK_LABEL[t]}
          </Link>
        ))}
      </nav>
      {task === "catatan" && <Banner>Data sintetis; BPI 2019 tidak memiliki catatan teks</Banner>}
      {mayRun && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; klasifikasi dinonaktifkan</p>}
      {error && <Banner tone="warning">{error}</Banner>}

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold text-ink">Ringkasan per kategori</h3>
        <ul className="flex flex-col gap-1.5">
          {summaryKeys.map((k) => {
            const pct = counted ? formatPercent((byCategory[k] ?? 0) / counted) : "0%";
            return (
              <li key={k} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5rem] items-center gap-2 text-sm">
                <span title={labelOf(k)} className="truncate text-ink-2">{labelOf(k)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-sidebar" aria-hidden><span className="block h-full rounded-full bg-accent" style={{ width: pct }} /></span>
                <span className="text-right tabular-nums text-ink-2">{byCategory[k] ?? 0} ({pct})</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink-3">{counted} dari {items.length} item berkategori{unscored > 0 && ` · ${unscored} belum dinilai`}</p>
      </Card>

      {agg && (
        <div className="grid gap-4 lg:grid-cols-2">
          {([["Per aktivitas", "activity", agg.rows], ["Per periode", "period", agg.periods]] as const).map(([title, field, groups]) => (
            <Card key={title} className="overflow-x-auto p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-ink-3">
                  <th className="pb-1 font-medium">{field === "activity" ? "Aktivitas" : "Periode"}</th>
                  {aggKeys.map((k) => <th key={k} className="pb-1 pl-2 text-right font-medium"><span title={labelOf(k)} className="block max-w-[6rem] truncate">{labelOf(k)}</span></th>)}
                  <th className="pb-1 pl-2 text-right font-medium">Total</th>
                </tr></thead>
                <tbody>
                  {groups.map((g) => {
                    const name = "activity" in g ? g.activity : g.period;
                    return (
                      <tr key={name} className="border-t border-line">
                        <th scope="row" className="py-1.5 pr-2 font-medium text-ink"><span title={name} className="block max-w-[10rem] truncate">{name}</span></th>
                        {aggKeys.map((k) => <td key={k} className="py-1.5 pl-2 text-right tabular-nums text-ink-2">{g.counts[k] ?? 0}</td>)}
                        <td className="py-1.5 pl-2 text-right font-medium tabular-nums text-ink">{g.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{rows.length} item</p>
        <div className="w-48">
          <Select size="sm" aria-label="Filter status" items={FILTER_ITEMS} selectedKey={filter} onSelectionChange={(k) => setFilter(String(k))}>
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
          </Select>
        </div>
      </div>
      <Card className="overflow-hidden">
        <Table aria-label="Item klasifikasi" size="sm">
          <Table.Header>
            <Table.Head id="text" isRowHeader label="TEKS" className="w-full" />
            <Table.Head id="ctx" label="KONTEKS" />
            <Table.Head id="cat" label="KATEGORI EFEKTIF" />
            <Table.Head id="top" label="TERATAS" />
            <Table.Head id="second" label="KEDUA" />
            <Table.Head id="status" label="STATUS" />
            <Table.Head id="by" label="PENILAI" />
            <Table.Head id="act" label="AKSI" />
          </Table.Header>
          <Table.Body>
            {rows.map((item) => {
              const r = resultOf(item.id);
              const eff = r && effectiveClass(r, state.classCorrections, order);
              const verdict = !!r && (r.status !== "gagal" || eff?.source === "analis");
              const two = r && r.status !== "gagal" ? topTwoOf(r.probs, order.length ? order : Object.keys(r.probs)) : undefined;
              const confirmable = !!r && r.status !== "gagal" && !state.classCorrections.some((c) => c.resultId === r.id);
              return (
                <Table.Row key={item.id} id={item.id}>
                  <Table.Cell className="px-6 text-sm text-ink"><Trunc text={item.text} /></Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink-2"><Trunc text={item.context} className="max-w-[10rem]" /></Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{eff && verdict ? `${labelOf(eff.category)} (${eff.source === "analis" ? "analis" : "model"})` : "–"}</Table.Cell>
                  <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">{two ? `${labelOf(two.top[0])} ${formatPercent(two.top[1])}` : "–"}</Table.Cell>
                  <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">{two ? `${labelOf(two.second[0])} ${formatPercent(two.second[1])}` : "–"}</Table.Cell>
                  <Table.Cell className="px-6 whitespace-nowrap">
                    {r ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ClassStatusBadge status={r.status} />
                        {isStale(r.specVersion, state, project.id, task) && <Pill className="text-ink-2">Spesifikasi telah diperbarui</Pill>}
                      </span>
                    ) : <Pill className="text-ink-2">Belum dinilai</Pill>}
                  </Table.Cell>
                  <Table.Cell className="px-6 whitespace-nowrap">
                    {!verdict ? <span className="text-sm text-ink-3">–</span> : eff?.source === "model" ? <Pill className="text-ink-2">Dinilai model</Pill> : <Pill>Oleh analis</Pill>}
                  </Table.Cell>
                  <Table.Cell className="px-6 whitespace-nowrap">
                    {r && mayCorrect ? (
                      <span className="flex gap-1.5">
                        {confirmable && <Button color="secondary" size="xs" aria-label={`Konfirmasi: ${item.text}`} onClick={() => setError(dispatch({ type: "confirmClass", resultId: r.id }))}>Konfirmasi</Button>}
                        <Button color="secondary" size="xs" aria-label={`Koreksi: ${item.text}`} onClick={() => setCorrectingId(r.id)}>Koreksi</Button>
                      </span>
                    ) : <span className="text-sm text-ink-3">–</span>}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-2">Tidak ada item untuk filter ini</p>}
      </Card>

      {correcting && correctingItem && spec && mayCorrect && (
        <ClassCorrectionModal key={correcting.id} result={correcting} item={correctingItem} spec={spec} onClose={() => setCorrectingId(null)} />
      )}

      <NoraModal open={confirmAll} onClose={() => setConfirmAll(false)} title="Ulangi semua klasifikasi?"
        description="Semua item dinilai ulang. Hasil lama dan koreksinya disimpan sebagai riwayat tetapi tidak berlaku untuk hasil baru; item yang sudah dikoreksi perlu ditinjau lagi."
        footer={<>
          <Button color="secondary" size="xs" onClick={() => setConfirmAll(false)}>Batal</Button>
          <Button color="primary" size="xs" onClick={() => run("semua")}>Ulangi semua</Button>
        </>}>
        {correctedCount > 0 && <p className="text-sm font-medium text-ink">{correctedCount} item sudah dikoreksi analis dan akan kembali ke antrean review.</p>}
      </NoraModal>
    </div>
  );
}
