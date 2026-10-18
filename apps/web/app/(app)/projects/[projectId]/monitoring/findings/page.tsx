"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { ChangePill, KindPill, SeverityPill } from "@/components/project/finding-badges";
import { changesFor, fmtMeasure, resolveBaseline } from "@/lib/mock/finding-view";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { RunPicker, useSelectedRun } from "@/components/project/run-picker";
import { useProject } from "@/components/project/use-project";
import { runLabel } from "@/components/project/compliance-table";
import { CHANGE_LABEL, FINDING_KIND_LABEL, type ChangeStatus, type FindingKind } from "@/lib/mock/findings";
import type { MonitoringRun } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

export default function FindingsPage() {
  return <Suspense><Content /></Suspense>;
}

const nf = new Intl.NumberFormat("id-ID");
const SELECT = "rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-normal text-ink";

function Content() {
  const ctx = useProject();
  const { run } = useSelectedRun();
  if (!ctx) return null;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/findings" />
      <RunPicker />
      {run ? <Body key={run.id} run={run} /> : (
        <Card><p className="px-4 py-10 text-center text-sm font-medium">Belum ada run monitoring</p></Card>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-pressed={on} onClick={onClick}
      className={cx("rounded-full border px-3 py-1 text-xs", on ? "border-accent bg-white font-medium text-ink" : "border-line text-ink-2 hover:text-ink")}>
      {children}
    </button>
  );
}

function Body({ run }: { run: MonitoringRun }) {
  const { project, state } = useProject()!;
  const router = useRouter();
  const param = useSearchParams().get("baseline");
  const [status, setStatus] = useState<ChangeStatus | null>(null);
  const [kind, setKind] = useState<FindingKind | null>(null);
  const baseline = resolveBaseline(state, run, param);
  const all = changesFor(state, run, baseline);
  const rows = all.filter((c) => (!status || c.status === status) && (!kind || c.finding.kind === kind));
  const others = state.runs.filter((r) => r.projectId === project.id && r.id !== run.id);
  const setBaseline = (v: string) => {
    const q = new URLSearchParams(window.location.search);
    q.set("baseline", v);
    router.replace(`?${q}`);
  };
  const href = (id: string) => `/projects/${project.id}/monitoring/findings/${encodeURIComponent(id)}?run=${run.id}${param ? `&baseline=${encodeURIComponent(param)}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">Temuan adalah hasil terukur, bukan diagnosis penyebab.</p>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">Bandingkan dengan
          <select value={baseline?.id ?? "none"} onChange={(e) => setBaseline(e.target.value)} className={SELECT}>
            {others.map((r) => <option key={r.id} value={r.id}>{runLabel(state, r)}</option>)}
            <option value="none">Tanpa pembanding</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status perubahan">
        <Chip on={status === null} onClick={() => setStatus(null)}>Semua status</Chip>
        {(Object.keys(CHANGE_LABEL) as ChangeStatus[]).map((s) => (
          <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{CHANGE_LABEL[s]}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter jenis temuan">
        <Chip on={kind === null} onClick={() => setKind(null)}>Semua jenis</Chip>
        {(Object.keys(FINDING_KIND_LABEL) as FindingKind[]).map((k) => (
          <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{FINDING_KIND_LABEL[k]}</Chip>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MagnifyingGlass size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Tidak ada temuan yang memenuhi ambang</p>
          </div>
        </Card>
      ) : (
        <Card>
          <Table aria-label="Temuan" size="sm">
            <Table.Header>
              <Table.Head id="title" isRowHeader label="TEMUAN" className="w-full" />
              <Table.Head id="kind" label="JENIS" />
              <Table.Head id="sev" label="KEPARAHAN" />
              <Table.Head id="status" label="PERUBAHAN" />
              <Table.Head id="measure" label="UKURAN" />
              <Table.Head id="cases" label="KASUS TERDAMPAK" />
            </Table.Header>
            <Table.Body>
              {rows.map(({ finding: f, status: st, baselineMeasure, smallSample }) => (
                <Table.Row key={f.id} id={f.id}>
                  <Table.Cell className="max-w-md px-6 text-sm text-ink">
                    <Link href={href(f.id)} title={f.title} className="line-clamp-2 font-medium hover:text-accent hover:underline">{f.title}</Link>
                  </Table.Cell>
                  <Table.Cell className="px-6"><KindPill kind={f.kind} /></Table.Cell>
                  <Table.Cell className="px-6"><SeverityPill severity={f.severity} /></Table.Cell>
                  <Table.Cell className="px-6">
                    <span className="inline-flex items-center gap-1.5"><ChangePill status={st} />{smallSample && <span className="text-xs text-ink-3">Sampel kecil</span>}</span>
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                    {fmtMeasure(st === "tidak_lagi_terdeteksi" ? null : f.measure, f.unit)}
                    <span className="text-ink-3"> vs {fmtMeasure(baselineMeasure, f.unit)}</span>
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{nf.format(f.affectedCases)} / {nf.format(f.populationCases)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}
    </>
  );
}
