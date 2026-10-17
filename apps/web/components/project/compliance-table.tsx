"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Table } from "@/components/application/table/table";
import { RuleStatusBadge } from "@/components/project/rule-status";
import { Sparkline } from "@/components/project/sparkline";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import { evaluateRun, summarize, termFor } from "@/lib/mock/compliance";
import { RULE_TYPE_LABEL } from "@/lib/mock/rules";
import type { MockState, MonitoringRun, RuleVersion } from "@/lib/mock/types";

export const runLabel = (s: MockState, run: MonitoringRun): string =>
  `${formatDate(run.createdAt)} · ${s.sources.find((x) => x.id === run.sourceId)?.name ?? run.sourceId} · ${run.periodFrom}–${run.periodTo}`;

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const frac = (n: number, total: number) => `${n} (${pct(n, total)}%)`;

export function ComplianceTable({ run }: { run: MonitoringRun }) {
  const ctx = useProject();
  const snapshots = ctx?.state.snapshots, mappings = ctx?.state.mappings;
  const rows = useMemo(() => {
    if (!ctx) return [];
    const top = new Map<string, RuleVersion>();
    for (const v of run.ruleVersions) if ((top.get(v.ruleKey)?.version ?? 0) < v.version) top.set(v.ruleKey, v);
    return [...top.values()].map((v) => ({ v, s: summarize(evaluateRun(ctx.state, run, v.ruleKey)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evaluateRun reads only snapshots and mappings from state
  }, [run, snapshots, mappings]);
  if (!ctx) return null;
  const { project } = ctx;
  const base = `/projects/${project.id}`;

  return (
    <Table aria-label="Kepatuhan" size="sm">
      <Table.Header>
        <Table.Head id="name" isRowHeader label="NAMA" className="w-full" />
        <Table.Head id="type" label="JENIS" />
        <Table.Head id="status" label="STATUS" />
        <Table.Head id="ver" label="VERSI" />
        <Table.Head id="src" label="RUJUKAN" />
        <Table.Head id="ok" label="PATUH" />
        <Table.Head id="bad" label="KETIDAKPATUHAN" />
        <Table.Head id="na" label="TIDAK DAPAT DIEVALUASI" />
        <Table.Head id="bar" label="PROPORSI" />
        <Table.Head id="trend" label="TREN" />
      </Table.Header>
      <Table.Body>
        {rows.map(({ v, s }) => {
          const src = `${v.source.docTitle} · ${v.source.section}`;
          const trend = s.byMonth.map((m) => { const e = m.patuh + m.tidakPatuh; return e ? (m.tidakPatuh / e) * 100 : 0; });
          return (
            <Table.Row key={v.ruleKey} id={v.ruleKey}>
              <Table.Cell className="max-w-[280px] px-6 text-sm font-medium text-ink">
                <Link href={`${base}/monitoring/compliance/${v.ruleKey}?run=${run.id}`} title={v.name} className="block truncate hover:underline">{v.name}</Link>
              </Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{RULE_TYPE_LABEL[v.params.type]}</Table.Cell>
              <Table.Cell className="px-6"><RuleStatusBadge status={v.status} /></Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">v{v.version}</Table.Cell>
              <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2"><span title={src} className="block truncate">{src}</span></Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{frac(s.patuh, s.total)}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                {frac(s.tidakPatuh, s.total)}
                <span className="block text-xs text-ink-3">{termFor(v)}</span>
              </Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{frac(s.tidakDapat, s.total)}</Table.Cell>
              <Table.Cell className="px-6">
                <div className="flex h-2 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="bg-status-active" style={{ width: `${pct(s.patuh, s.total)}%` }} />
                  <div className="bg-status-ended" style={{ width: `${pct(s.tidakPatuh, s.total)}%` }} />
                  <div className="bg-status-suspended" style={{ width: `${pct(s.tidakDapat, s.total)}%` }} />
                </div>
              </Table.Cell>
              <Table.Cell className="px-6"><Sparkline values={trend} /></Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
