"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, MinusCircle, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Table } from "@/components/application/table/table";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { NotFoundPanel } from "@/components/not-found-panel";
import { AssessmentTabs } from "@/components/project/assessment-tabs";
import { ReliabilityChart } from "@/components/project/reliability-chart";
import { useProject } from "@/components/project/use-project";
import { formatDate, formatNumber, formatRatioPct as pct } from "@/lib/format";
import { RELEVANCE_LABEL, RELEVANCE_ORDER } from "@/lib/mock/assessment";
import { TARGETS, agreementPairs, canEditSecondLabel, cohenKappa, computeMetrics, evalPairs, reviewShareOf } from "@/lib/mock/evaluation";
import { acceptsData } from "@/lib/mock/permissions";
import { activeSpec } from "@/lib/mock/specs";
import type { TaskKind } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const TASK_LABEL: Record<TaskKind, string> = { relevansi: "Relevansi", aktivitas: "Aktivitas", catatan: "Catatan" };
const pointDelta = (d: number) => {
  const r = Math.round(d * 1000) / 10; // round first so a tiny negative never prints "-0,0"
  return `${r < 0 ? "-" : "+"}${formatNumber(Math.abs(r), 1)} poin persen`;
};

type Verdict = "ok" | "no" | "none";
const VERDICT = {
  ok: { text: "Memenuhi", Icon: CheckCircle, tone: "text-status-active" },
  no: { text: "Belum memenuhi", Icon: XCircle, tone: "text-status-ended" },
  none: { text: "–", Icon: MinusCircle, tone: "text-ink-3" },
} as const;

const Trunc = ({ text, className }: { text: string; className?: string }) => (
  <span title={text} className={cx("block max-w-[16rem] truncate", className)}>{text}</span>
);

export function EvaluationView({ task }: { task: TaskKind }) {
  const ctx = useProject();
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return <NotFoundPanel />;
  const { project, state, can, dispatch } = ctx;
  const base = `/projects/${project.id}/assessments/evaluation`;
  const open = acceptsData(project.status);
  const mayEdit = can("gold.edit", project.id) && open;
  const mayRun = can("evaluation.run", project.id) && open;

  const spec = activeSpec(state, project.id, task);
  const options = task === "relevansi"
    ? RELEVANCE_ORDER.map((k) => ({ id: k as string, label: RELEVANCE_LABEL[k] }))
    : (spec?.categories ?? []).map((c) => ({ id: c.key, label: c.label }));
  const labelOf = (k: string) => options.find((o) => o.id === k)?.label ?? k;
  const itemName = (ref: string) => {
    if (task === "relevansi") {
      const [fid, cid] = ref.split(":");
      const f = state.findings.find((x) => x.id === fid);
      const c = state.candidates.find((x) => x.id === cid);
      return f && c ? `${f.title} · ${c.name}` : ref;
    }
    return state.classItems.find((i) => i.id === ref)?.text ?? ref;
  };

  const { pairs, excluded, items } = evalPairs(state, project.id, task);
  const m = computeMetrics(pairs);
  const kappaPairs = agreementPairs(state, project.id, task);
  const kappa = cohenKappa(kappaPairs);
  const reviewShare = reviewShareOf(state, project.id, task);
  const empty = m.n === 0;
  const target = TARGETS[task].accuracy;
  const cards: { label: string; value: string; target?: string; verdict: Verdict }[] = [
    { label: "Akurasi", value: pct(m.accuracy), target: `Target ≥ ${pct(target)}`, verdict: m.accuracy == null ? "none" : m.accuracy >= target - 1e-9 ? "ok" : "no" },
    { label: "Macro-F1", value: pct(m.macroF1), verdict: "none" },
    { label: "Cakupan otomatis", value: pct(m.autoCoverage), verdict: "none" },
    { label: "Akurasi otomatis", value: pct(m.autoAccuracy), verdict: "none" },
    { label: "Bagian perlu review", value: pct(reviewShare), target: `Target ≤ ${pct(TARGETS.reviewShareMax)}`, verdict: reviewShare == null ? "none" : reviewShare <= TARGETS.reviewShareMax + 1e-9 ? "ok" : "no" },
    { label: "Akurasi keyakinan ≥ 80%", value: pct(m.highConf.accuracy), target: `Target ≥ ${pct(TARGETS.highConfAccuracy)} (n = ${m.highConf.n})`, verdict: m.highConf.accuracy == null ? "none" : m.highConf.accuracy >= TARGETS.highConfAccuracy - 1e-9 ? "ok" : "no" },
  ];

  const runs = state.evaluations.filter((e) => e.projectId === project.id && e.task === task).reverse().sort((a, b) => b.at.localeCompare(a.at)); // reverse first: runs sharing a timestamp stay newest-first
  const setLabel = (itemRef: string, label: string) => setError(dispatch({ type: "setGoldLabel", projectId: project.id, task, itemRef, label }));

  const labelCell = (current: string | undefined, editable: boolean, itemRef: string, name: string, which: string) =>
    current !== undefined && !options.some((o) => o.id === current) ? (
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-2"><span title={current} className="max-w-[10rem] truncate">{current}</span><Pill>tidak ada di spesifikasi aktif</Pill></span>
    ) : editable ? (
      <div className="w-44">
        <Select size="sm" aria-label={`Label ${which}: ${name}`} items={options} placeholder="Pilih label" selectedKey={current ?? null} onSelectionChange={(k) => setLabel(itemRef, String(k))}>
          {(o) => <Select.Item id={o.id}>{o.label}</Select.Item>}
        </Select>
      </div>
    ) : <span className="text-sm text-ink-2">{current === undefined ? "–" : labelOf(current)}</span>;

  return (
    <div className="flex flex-col gap-4">
      <AssessmentTabs active="evaluasi" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">Evaluasi</h2>
          {spec && <p title={spec.question} className="text-sm text-ink-2">{spec.question} · spesifikasi v{spec.version}</p>}
        </div>
      </div>
      <nav aria-label="Tugas" className="flex gap-2">
        {(Object.keys(TASK_LABEL) as TaskKind[]).map((t) => (
          <Link key={t} href={`${base}?task=${t}`} aria-current={t === task ? "page" : undefined}
            className={cx("rounded-md border px-3 py-1 text-sm", t === task ? "border-accent bg-canvas font-medium text-ink" : "border-line text-ink-2 hover:text-ink")}>
            {TASK_LABEL[t]}
          </Link>
        ))}
      </nav>
      {task === "catatan" && <Banner>Data sintetis; BPI 2019 tidak memiliki catatan teks</Banner>}
      {!open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; perubahan set acuan dan evaluasi dinonaktifkan</p>}
      {error && <Banner tone="warning">{error}</Banner>}

      <section aria-labelledby="gold-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="gold-h" className="text-sm font-semibold text-ink">Set acuan</h3>
          <p className="text-sm text-ink-2">
            {items.length} item · Kesepakatan pelabel: {kappa == null ? "–" : `κ = ${formatNumber(kappa, 2)} (${kappaPairs.length} item dua pelabel)`}
          </p>
        </div>
        <Card className="overflow-hidden">
          <Table aria-label="Set acuan" size="sm">
            <Table.Header>
              <Table.Head id="item" isRowHeader label="ITEM" className="w-full" />
              <Table.Head id="a" label="LABEL PERTAMA" />
              <Table.Head id="b" label="LABEL KEDUA" />
              <Table.Head id="agree" label="KESEPAKATAN" />
              <Table.Head id="pred" label="PREDIKSI MODEL" />
              <Table.Head id="act" label="AKSI" />
            </Table.Header>
            <Table.Body>
              {items.map(({ gold, result }) => {
                const name = itemName(gold.itemRef);
                const short = name.length > 60 ? `${name.slice(0, 60)}…` : name;
                const mine = gold.labeler === state.viewerId;
                const agree = gold.labelB === undefined ? undefined : gold.labelB === gold.label;
                return (
                  <Table.Row key={gold.id} id={gold.id}>
                    <Table.Cell className="px-6 text-sm text-ink"><Trunc text={name} /></Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap">{labelCell(gold.label, mayEdit && mine, gold.itemRef, short, "pertama")}</Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap">{labelCell(gold.labelB, mayEdit && canEditSecondLabel(gold, state.viewerId), gold.itemRef, short, "kedua")}</Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap">
                      {agree === undefined ? <span className="text-sm text-ink-3">Belum ada label kedua</span> : (
                        <Pill>{agree ? <CheckCircle size={14} weight="fill" className="text-status-active" aria-hidden /> : <XCircle size={14} weight="fill" className="text-status-ended" aria-hidden />}{agree ? "Sepakat" : "Berbeda"}</Pill>
                      )}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">
                      {result ? `${labelOf(result.pred)} ${pct(result.conf)}` : <span title="Tanpa hasil model yang valid">Tidak dapat dievaluasi (Tanpa hasil model yang valid)</span>}
                    </Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap">
                      {mayEdit ? <Button color="secondary" size="xs" aria-label={`Hapus: ${short}`} onClick={() => setError(dispatch({ type: "removeGoldItem", goldId: gold.id }))}>Hapus</Button> : <span className="text-sm text-ink-3">–</span>}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
          {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-2">Set acuan kosong</p>}
        </Card>
      </section>

      <section aria-labelledby="report-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="report-h" className="text-sm font-semibold text-ink">Laporan</h3>
          {mayRun && <Button color="primary" size="xs" onClick={() => setError(dispatch({ type: "runEvaluation", projectId: project.id, task }))}>Jalankan evaluasi</Button>}
        </div>
        <p className="text-sm text-ink-2">
          {empty ? (items.length ? "Tidak ada item yang dapat dievaluasi" : "Set acuan kosong") : `${m.n} item dievaluasi`} · {excluded} item dikecualikan (tanpa hasil model yang valid). Target bertanda [perlu validasi Javan].
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const v = VERDICT[c.verdict];
            return (
              <li key={c.label}>
                <Card className="flex h-full flex-col gap-1 p-4">
                  <span className="text-xs text-ink-3">{c.label}</span>
                  <span className="text-[20px] leading-7 font-semibold tabular-nums text-ink">{empty && c.label !== "Bagian perlu review" ? "–" : c.value}</span>
                  <span className="text-xs text-ink-3">{c.target ? `${c.target} [perlu validasi Javan]` : "Tanpa target"}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-2"><v.Icon size={14} weight="fill" className={v.tone} aria-hidden />{empty && c.label !== "Bagian perlu review" ? "–" : v.text}</span>
                </Card>
              </li>
            );
          })}
        </ul>
        <Card className="overflow-x-auto p-4">
          <h4 className="mb-2 text-sm font-semibold text-ink">Diagram reliabilitas</h4>
          <ReliabilityChart bins={m.bins} />
        </Card>
      </section>

      <section aria-labelledby="hist-h" className="flex flex-col gap-3">
        <h3 id="hist-h" className="text-sm font-semibold text-ink">Riwayat evaluasi</h3>
        <Card className="overflow-x-auto p-4">
          {runs.length === 0 ? <p className="text-sm text-ink-2">Belum ada evaluasi tersimpan</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-ink-3">
                {["Tanggal", "Model", "Spesifikasi", "n", "Akurasi", "Macro-F1", "Selisih akurasi"].map((h, i) => <th key={h} scope="col" className={cx("pb-1 font-medium", i > 2 && "text-right")}>{h}</th>)}
              </tr></thead>
              <tbody>
                {runs.map((r, i) => {
                  const prev = runs[i + 1];
                  return (
                    <tr key={r.id} className="border-t border-line text-ink-2">
                      <td className="py-1.5 whitespace-nowrap">{formatDate(r.at)}</td>
                      <td className="py-1.5"><Trunc text={r.modelId} className="max-w-[12rem]" /></td>
                      <td className="py-1.5">v{r.specVersion}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.n}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.n ? pct(r.accuracy) : "–"}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.n ? pct(r.macroF1) : "–"}</td>
                      <td className="py-1.5 text-right tabular-nums">{prev && r.n && prev.n ? pointDelta(r.accuracy - prev.accuracy) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
