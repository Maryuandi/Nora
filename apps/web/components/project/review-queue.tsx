"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Card } from "@/components/nora/card";
import { AssessmentStatusBadge } from "@/components/project/assessment-status";
import { useProject } from "@/components/project/use-project";
import { formatPercent } from "@/lib/format";
import { RELEVANCE_LABEL, STATUS_LABEL, hasRelevanceResult, reviewQueue, topTwo } from "@/lib/mock/assessment";
import type { AssessmentStatus } from "@/lib/mock/types";

const ALL = "all";
const Trunc = ({ text }: { text: string }) => <span title={text} className="block max-w-[16rem] truncate text-sm text-ink">{text}</span>;

export function ReviewQueue({ projectId }: { projectId: string }) {
  const ctx = useProject();
  const [findingId, setFindingId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  if (!ctx) return null;
  const { state } = ctx;
  const base = `/projects/${projectId}`;

  const all = reviewQueue(state, projectId);
  const findingItems = [{ id: ALL, label: "Semua temuan" }, ...state.findings.filter((f) => f.projectId === projectId).map((f) => ({ id: f.id, label: f.title }))];
  const statuses = [...new Set(all.map((a) => a.status))];
  const statusItems = [{ id: ALL, label: "Semua status" }, ...statuses.map((s) => ({ id: s, label: STATUS_LABEL[s] }))];
  // A selected filter may vanish after corrections (e.g. last item of that status); fall back to "all".
  const fId = findingItems.some((i) => i.id === findingId) ? findingId : ALL;
  const st = statusItems.some((i) => i.id === status) ? status : ALL;
  const rows = reviewQueue(state, projectId, { findingId: fId === ALL ? undefined : fId, status: st === ALL ? undefined : (st as AssessmentStatus) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-60"><Select size="sm" aria-label="Filter temuan" items={findingItems} selectedKey={fId} onSelectionChange={(k) => setFindingId(String(k))}>
          {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
        </Select></div>
        <div className="w-60"><Select size="sm" aria-label="Filter status" items={statusItems} selectedKey={st} onSelectionChange={(k) => setStatus(String(k))}>
          {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
        </Select></div>
      </div>
      {rows.length ? (
        <Card className="overflow-hidden">
          <Table aria-label="Antrean review" size="sm">
            <Table.Header>
              <Table.Head id="finding" isRowHeader label="TEMUAN" className="w-full" />
              <Table.Head id="candidate" label="KANDIDAT" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="top" label="OPSI TERATAS" />
              <Table.Head id="second" label="OPSI KEDUA" />
              <Table.Head id="act" label="" />
            </Table.Header>
            <Table.Body>
              {rows.map((a) => {
                const finding = state.findings.find((f) => f.id === a.findingId);
                const cand = state.candidates.find((c) => c.id === a.candidateId);
                const t = hasRelevanceResult(a) ? topTwo(a.relevance.probs) : null;
                const opt = (o?: [keyof typeof RELEVANCE_LABEL, number]) => (o ? `${RELEVANCE_LABEL[o[0]]} ${formatPercent(o[1])}` : "–");
                return (
                  <Table.Row key={a.id} id={a.id}>
                    <Table.Cell className="px-6"><Trunc text={finding?.title ?? "-"} /></Table.Cell>
                    <Table.Cell className="px-6"><Trunc text={cand?.name ?? "-"} /></Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap"><AssessmentStatusBadge status={a.status} /></Table.Cell>
                    <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">{opt(t?.top)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">{opt(t?.second)}</Table.Cell>
                    <Table.Cell className="px-6 whitespace-nowrap">
                      <Link href={`${base}/assessments/${a.findingId}?kandidat=${encodeURIComponent(a.candidateId)}`}><Button color="secondary" size="xs">Tinjau</Button></Link>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <CheckCircle size={28} className="text-ink-3" aria-hidden />
          <p className="text-sm font-medium">Tidak ada hasil yang perlu ditinjau</p>
        </Card>
      )}
    </div>
  );
}
