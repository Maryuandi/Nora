"use client";

import { Table } from "@/components/application/table/table";
import { Pill } from "@/components/nora/badges";
import { AssessmentStatusBadge } from "@/components/project/assessment-status";
import { formatPercent, formatScore } from "@/lib/format";
import { RELEVANCE_LABEL, hasModelVerdict, hasRelevanceResult, topTwo, totalScore } from "@/lib/mock/assessment";
import type { Assessment, Candidate, Finding, Relevance } from "@/lib/mock/types";

export type CandidateRow = {
  candidate: Candidate;
  assessment?: Assessment;
  effective?: { relevance: Relevance; source: "model" | "analis" };
};

const Trunc = ({ text, className }: { text: string; className?: string }) => (
  <span title={text} className={`block max-w-[16rem] truncate ${className ?? ""}`}>{text}</span>
);

export function CandidateTable({ finding, rows, onOpen }: { finding: Finding; rows: CandidateRow[]; onOpen: (candidateId: string) => void }) {
  return (
    <Table aria-label={`Kandidat untuk ${finding.title}`} size="sm">
      <Table.Header>
        <Table.Head id="name" isRowHeader label="KANDIDAT" className="w-full" />
        <Table.Head id="kind" label="JENIS" />
        <Table.Head id="status" label="STATUS" />
        <Table.Head id="score" label="SKOR TOTAL" />
        <Table.Head id="rel" label="RELEVANSI EFEKTIF" />
        <Table.Head id="top" label="PROB. TERATAS" />
        <Table.Head id="by" label="PENILAI" />
      </Table.Header>
      <Table.Body>
        {rows.map(({ candidate: c, assessment: a, effective: e }) => {
          const open = c.applicable && a ? () => onOpen(c.id) : undefined;
          const verdict = !!a && (hasModelVerdict(a) || e?.source === "analis");
          const score = a ? totalScore(a.scores, c.criteria) : null;
          return (
            <Table.Row key={c.id} id={c.id} onAction={open} className={c.applicable ? (open ? "cursor-pointer" : undefined) : "bg-canvas text-ink-3"}>
              <Table.Cell className="px-6">
                <Trunc text={c.name} className={c.applicable ? "text-sm font-medium text-ink" : "text-sm font-medium text-ink-3"} />
                {!c.applicable && <Trunc text={`Tidak dinilai: ${c.notApplicableReason ?? "-"}`} className="text-xs text-ink-3" />}
              </Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{c.kind === "hipotesis" ? "Hipotesis" : "Intervensi"}</Table.Cell>
              <Table.Cell className="px-6 whitespace-nowrap">
                {!c.applicable ? <Pill className="text-ink-3">Tidak dinilai</Pill> : a ? <AssessmentStatusBadge status={a.status} /> : <Pill className="text-ink-2">Belum dinilai</Pill>}
              </Table.Cell>
              <Table.Cell className="px-6 whitespace-nowrap">
                {a ? (
                  <span className="flex items-center gap-2 text-sm tabular-nums text-ink">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sidebar" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${score ?? 0}%` }} />
                    </span>
                    {formatScore(score)}
                  </span>
                ) : <span className="text-sm text-ink-3">–</span>}
              </Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                {e && verdict ? `${RELEVANCE_LABEL[e.relevance]} (${e.source})` : "–"}
              </Table.Cell>
              <Table.Cell className="px-6 text-sm tabular-nums whitespace-nowrap text-ink-2">
                {a && hasRelevanceResult(a) ? `${RELEVANCE_LABEL[topTwo(a.relevance.probs).top[0]]} ${formatPercent(topTwo(a.relevance.probs).top[1])}` : "–"}
              </Table.Cell>
              <Table.Cell className="px-6 whitespace-nowrap">
                {!verdict ? <span className="text-sm text-ink-3">–</span> : e?.source === "model" ? <Pill className="text-ink-2">Dinilai model</Pill> : e ? <Pill>Oleh analis</Pill> : <span className="text-sm text-ink-3">–</span>}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
