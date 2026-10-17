"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { ComplianceTrend } from "@/components/project/compliance-trend";
import { ProvenancePanel } from "@/components/project/provenance-panel";
import { RuleStatusBadge } from "@/components/project/rule-status";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import { CASE_STATUS_LABEL, evaluateRun, summarize, termFor } from "@/lib/mock/compliance";
import { runsForProject } from "@/lib/mock/reducer";
import { ruleSummary } from "@/lib/mock/rules";
import type { CaseStatus } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const PAGE = 50;
const DOT: Record<CaseStatus, string> = { patuh: "bg-status-active", tidak_patuh: "bg-status-ended", tidak_dapat_dievaluasi: "bg-status-suspended" };
const FILTERS: { id: CaseStatus | null; label: string }[] = [
  { id: null, label: "Semua" },
  ...(["patuh", "tidak_patuh", "tidak_dapat_dievaluasi"] as const).map((id) => ({ id, label: CASE_STATUS_LABEL[id] })),
];
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export default function ComplianceDetailPage() {
  const { ruleKey } = useParams<{ ruleKey: string }>();
  return <Suspense><ComplianceRoute ruleKey={ruleKey} /></Suspense>;
}

// Remount on rule or run change so filter and page reset.
function ComplianceRoute({ ruleKey }: { ruleKey: string }) {
  const wanted = useSearchParams().get("run") ?? "";
  return <ComplianceDetail key={`${ruleKey}:${wanted}`} ruleKey={ruleKey} />;
}

function ComplianceDetail({ ruleKey }: { ruleKey: string }) {
  const ctx = useProject();
  const wanted = useSearchParams().get("run");
  const [filter, setFilter] = useState<CaseStatus | null>(null);
  const [page, setPage] = useState(0);
  const runs = ctx ? runsForProject(ctx.state, ctx.project.id) : [];
  const run = wanted ? runs.find((r) => r.id === wanted) : runs[0];
  const version = run?.ruleVersions.filter((r) => r.ruleKey === ruleKey).sort((a, b) => b.version - a.version)[0];
  const snapshots = ctx?.state.snapshots, mappings = ctx?.state.mappings;
  const { results, s } = useMemo(() => {
    const results = ctx && run ? evaluateRun(ctx.state, run, ruleKey) : [];
    return { results, s: summarize(results) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evaluateRun reads only snapshots and mappings from state
  }, [run, ruleKey, snapshots, mappings]);
  if (!ctx || !run || !version) return <NotFoundPanel />;
  const { project } = ctx;
  const rows = filter ? results.filter((r) => r.status === filter) : results;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const from = page * PAGE;
  const shown = rows.slice(from, from + PAGE);
  const count = (f: CaseStatus | null) => (f === "patuh" ? s.patuh : f === "tidak_patuh" ? s.tidakPatuh : f ? s.tidakDapat : s.total);
  const stats: [string, number][] = [["Patuh", s.patuh], [termFor(version), s.tidakPatuh], ["Tidak dapat dievaluasi", s.tidakDapat]];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/projects/${project.id}/monitoring/compliance?run=${run.id}`} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={14} aria-hidden />Kepatuhan
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.02em]">{version.name}</h1>
          <RuleStatusBadge status={version.status} />
        </div>
        <p className="mt-1 text-sm text-ink-2">{ruleSummary(version.params)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(([label, n]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-ink-3">{label}</p>
            <p className="mt-1 text-[28px] leading-9 font-semibold tracking-[-0.02em]">{n}</p>
            <p className="text-xs text-ink-3">{pct(n, s.total)}% dari {s.total} kasus</p>
          </Card>
        ))}
      </div>

      <Card className="p-4"><ComplianceTrend byMonth={s.byMonth} /></Card>

      <Card>
        <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Alasan tidak dapat dievaluasi</h3>
        {s.reasons.length ? (
          <ul className="divide-y divide-line">
            {s.reasons.map((r) => (
              <li key={r.reason} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="text-ink">{r.reason}</span><span className="text-ink-2">{r.count}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-ink-3">Semua kasus dapat dievaluasi</p>}
      </Card>

      <div className="flex rounded-lg border border-line bg-sidebar p-0.5 self-start" role="tablist" aria-label="Filter status kasus">
        {FILTERS.map((f) => (
          <button key={f.label} role="tab" aria-selected={filter === f.id} onClick={() => { setFilter(f.id); setPage(0); }}
            className={cx("rounded-md px-3 py-1 text-sm", filter === f.id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
            {f.label} <span className="ml-1 text-ink-3">{count(f.id)}</span>
          </button>
        ))}
      </div>
      <Card>
        <Table aria-label="Kasus" size="sm">
          <Table.Header>
            <Table.Head id="id" isRowHeader label="ID KASUS" />
            <Table.Head id="start" label="MULAI" />
            <Table.Head id="status" label="STATUS" />
            <Table.Head id="reason" label="ALASAN" className="w-full" />
            <Table.Head id="ver" label="VERSI ATURAN" />
          </Table.Header>
          <Table.Body>
            {shown.map((r) => (
              <Table.Row key={r.caseId} id={r.caseId}>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    {r.caseId}
                    <Tooltip title="Penelusuran kasus (M05) belum tersedia">
                      <TooltipTrigger aria-label="Penelusuran kasus (M05) belum tersedia" className="cursor-not-allowed text-ink-3 opacity-50"><ArrowSquareOut size={14} aria-hidden /></TooltipTrigger>
                    </Tooltip>
                  </span>
                </Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDate(r.start)}</Table.Cell>
                <Table.Cell className="px-6"><Pill dot={DOT[r.status]}>{CASE_STATUS_LABEL[r.status]}</Pill></Table.Cell>
                <Table.Cell className="px-6 text-sm text-ink-2">{r.reason ?? "—"}</Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{(() => { const v = run.ruleVersions.find((x) => x.id === r.ruleVersionId); return v ? `v${v.version}` : "—"; })()}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm text-ink-2">
          <span>{rows.length ? `${from + 1}–${from + shown.length} dari ${rows.length}` : "0 dari 0"}</span>
          <div className="flex gap-2">
            <Button color="secondary" size="xs" isDisabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
            <Button color="secondary" size="xs" isDisabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Berikutnya</Button>
          </div>
        </div>
      </Card>

      <ProvenancePanel run={run} ruleKey={ruleKey} />
    </div>
  );
}
