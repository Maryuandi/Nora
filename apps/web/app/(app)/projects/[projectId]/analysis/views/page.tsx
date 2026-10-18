"use client";

import { useRouter } from "next/navigation";
import { BookmarkSimple, Warning } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { AnalysisTabs } from "@/components/project/analysis-tabs";
import { useAnalysis } from "@/components/project/analysis-filter";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { describeFilter } from "@/lib/mock/analysis";
import { eventLogFor } from "@/lib/mock/eventlog";
import type { SavedView } from "@/lib/mock/types";

export default function SavedViewsPage() {
  const ctx = useProject();
  const router = useRouter();
  const { load } = useAnalysis();
  if (!ctx) return null;
  const { project, state } = ctx;
  const base = `/projects/${project.id}`;
  // Newest first; the mock clock is fixed, so ties fall back to insertion order (later first).
  const views = state.savedViews.map((v, i) => ({ v, i })).filter(({ v }) => v.projectId === project.id)
    .sort((a, b) => b.v.createdAt.localeCompare(a.v.createdAt) || b.i - a.i).map(({ v }) => v);
  const current = eventLogFor(state, project.id);
  const stale = (v: SavedView) => !current || current.snapshot.id !== v.snapshotId || current.mappingVersion !== v.mappingVersion;
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";
  const open = (v: SavedView) => { load(v); router.push(`${base}/analysis/map`); };

  return (
    <div className="flex flex-col gap-4">
      <AnalysisTabs active="/analysis/views" />
      <h2 className="text-xl font-semibold">Tampilan tersimpan</h2>
      {views.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BookmarkSimple size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada tampilan tersimpan</p>
            <p className="text-sm text-ink-3">Simpan filter dan pilihan dari halaman Peta proses atau Kasus untuk membukanya lagi nanti.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <Table aria-label="Tampilan tersimpan" size="sm">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="NAMA" />
              <Table.Head id="by" label="PEMBUAT" />
              <Table.Head id="at" label="TANGGAL" />
              <Table.Head id="filter" label="FILTER" />
              <Table.Head id="note" label="CATATAN" className="w-full" />
              <Table.Head id="act" label="" />
            </Table.Header>
            <Table.Body>
              {views.map((v) => {
                const filter = describeFilter(v.filter).join("; ") || "Tanpa filter";
                return (
                  <Table.Row key={v.id} id={v.id}>
                    <Table.Cell className="max-w-[260px] px-6 text-sm text-ink">
                      <span className="block truncate font-medium" title={v.name}>{v.name}</span>
                      {stale(v) && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs text-status-suspended">
                          <Warning size={14} weight="fill" className="mt-px shrink-0" aria-hidden />
                          Data berubah sejak tampilan ini disimpan; angka dapat berbeda
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{userName(v.createdBy)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(v.createdAt)}</Table.Cell>
                    <Table.Cell className="max-w-[280px] px-6 text-sm text-ink-2"><span className="block truncate" title={filter}>{filter}</span></Table.Cell>
                    <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2">
                      {v.note ? <span className="block truncate" title={v.note}>{v.note}</span> : "-"}
                    </Table.Cell>
                    <Table.Cell className="px-6"><Button color="secondary" size="xs" aria-label={`Buka tampilan ${v.name}`} onClick={() => open(v)}>Buka</Button></Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card>
      )}
    </div>
  );
}
