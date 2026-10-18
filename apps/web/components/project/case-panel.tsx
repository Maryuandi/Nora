"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SortDescriptor } from "react-aria-components";
import { X } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { formatDateTime, formatDuration } from "@/lib/format";
import { pageOf, sortCases, type LogCase } from "@/lib/mock/eventlog";

const PAGE_SIZE = 20;
type SortKey = "durasi" | "event" | "mulai";

/** Cases behind a selected map element. Mount with a `key` per selection so sort and page reset. */
export function CasePanel({ title, cases, note, base, onClose }: { title: string; cases: LogCase[]; note?: string; base: string; onClose: () => void }) {
  const [sort, setSort] = useState<{ by: SortKey; dir: "asc" | "desc" }>({ by: "durasi", dir: "desc" });
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => sortCases(cases, sort.by, sort.dir), [cases, sort]);
  const view = pageOf(sorted, page, PAGE_SIZE);
  const descriptor: SortDescriptor = { column: sort.by, direction: sort.dir === "asc" ? "ascending" : "descending" };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold" title={title}>{title}</h3>
          <p className="text-sm text-ink-2">
            <span data-testid="case-count">{cases.length.toLocaleString("id-ID")} kasus</span>
            {note && <span className="text-ink-3"> · {note}</span>}
          </p>
        </div>
        <Button color="secondary" size="xs" iconLeading={X} onClick={onClose}>Tutup</Button>
      </div>
      <Table aria-label={title} size="sm" sortDescriptor={descriptor}
        onSortChange={(d) => { setSort({ by: d.column as SortKey, dir: d.direction === "ascending" ? "asc" : "desc" }); setPage(1); }}>
        <Table.Header>
          <Table.Head id="id" isRowHeader label="ID KASUS" className="w-full" />
          <Table.Head id="mulai" label="MULAI" allowsSorting />
          <Table.Head id="durasi" label="DURASI" allowsSorting />
          <Table.Head id="event" label="JUMLAH EVENT" allowsSorting />
          <Table.Head id="tl" label="TIMELINE" />
        </Table.Header>
        <Table.Body>
          {view.items.map((c) => (
            <Table.Row key={c.id} id={c.id}>
              <Table.Cell className="max-w-[320px] px-6 text-sm font-medium text-ink"><span title={c.id} className="block truncate">{c.id}</span></Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(new Date(c.startMs).toISOString())}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDuration(c.durationMs)}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{c.events.length}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap"><Link href={`${base}/analysis/cases/${encodeURIComponent(c.id)}`} className="text-accent hover:underline">Buka timeline</Link></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-sm text-ink-2">
        <span>Halaman {view.page} dari {view.pages}</span>
        <div className="flex gap-2">
          <Button color="secondary" size="xs" isDisabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Sebelumnya</Button>
          <Button color="secondary" size="xs" isDisabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>Berikutnya</Button>
        </div>
      </div>
    </Card>
  );
}
