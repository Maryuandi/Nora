"use client";

import Link from "next/link";
import { ClipboardText } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { RecTabs } from "@/components/project/rec-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";

export default function TrialsPage() {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state } = ctx;
  const base = `/projects/${project.id}/recommendations`;
  const trials = state.trials.filter((t) => t.projectId === project.id);
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations/trials" />
      <Card>
        {trials.length ? (
          <Table aria-label="Usulan uji coba" size="sm">
            <Table.Header>
              <Table.Head id="a" isRowHeader label="TINDAKAN" className="w-full" />
              <Table.Head id="f" label="TEMUAN" />
              <Table.Head id="s" label="STATUS" />
              <Table.Head id="u" label="DIPERBARUI" />
            </Table.Header>
            <Table.Body>
              {trials.map((t) => (
                <Table.Row key={t.id} id={t.id}>
                  <Table.Cell className="max-w-[320px] px-6 text-sm font-medium"><Link href={`${base}/trials/${t.id}`} title={t.action} className="block truncate hover:underline">{t.action}</Link></Table.Cell>
                  <Table.Cell className="max-w-[260px] px-6 text-sm text-ink-2"><span className="block truncate">{state.recFindings.find((x) => x.id === t.findingId)?.title}</span></Table.Cell>
                  <Table.Cell className="px-6"><Pill>Draf</Pill></Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDate(t.updatedAt.slice(0, 10))}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <ClipboardText size={28} className="text-ink-3" aria-hidden /><p className="text-sm font-medium">Belum ada usulan uji coba</p>
            <p className="text-sm text-ink-3">Susun dari kandidat tervalidasi di halaman temuan.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
