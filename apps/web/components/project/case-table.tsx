"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SortDescriptor } from "react-aria-components";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { formatDuration, formatEventTime } from "@/lib/format";
import { pageOf, sortCases, type LogCase } from "@/lib/mock/eventlog";

type SortKey = "durasi" | "event" | "mulai";
const cell = "px-6 text-sm whitespace-nowrap text-ink-2";

/** Sortable, paged case list. `attrsAvailable` false (no case_attr mapping) shows "-" for vendor and PO, never a link. Mount with a `key` per cases source so sort and page reset. Case values are plain text. */
export function CaseTable({ cases, base, variantOf, size = 20, attrsAvailable = true, timezone = "Asia/Jakarta" }: { cases: LogCase[]; base: string; variantOf: (c: LogCase) => string; size?: number; attrsAvailable?: boolean; timezone?: string }) {
  const [sort, setSort] = useState<{ by: SortKey; dir: "asc" | "desc" }>({ by: "mulai", dir: "asc" });
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => sortCases(cases, sort.by, sort.dir), [cases, sort]);
  const view = pageOf(sorted, page, size);
  const descriptor: SortDescriptor = { column: sort.by, direction: sort.dir === "asc" ? "ascending" : "descending" };

  return (
    <>
      <Table aria-label="Daftar kasus" size="sm" sortDescriptor={descriptor}
        onSortChange={(d) => { setSort({ by: d.column as SortKey, dir: d.direction === "ascending" ? "asc" : "desc" }); setPage(1); }}>
        <Table.Header>
          <Table.Head id="id" isRowHeader label="ID KASUS" />
          <Table.Head id="mulai" label="MULAI" allowsSorting />
          <Table.Head id="durasi" label="DURASI" allowsSorting />
          <Table.Head id="event" label="EVENT" allowsSorting />
          <Table.Head id="vendor" label="VENDOR" className="w-full" />
          <Table.Head id="po" label="PO" />
          <Table.Head id="varian" label="VARIAN" />
        </Table.Header>
        <Table.Body>
          {view.items.map((c) => (
            <Table.Row key={c.id} id={c.id}>
              <Table.Cell className="max-w-[240px] px-6 text-sm font-medium">
                <Link href={`${base}/analysis/cases/${encodeURIComponent(c.id)}`} title={c.id} className="block truncate text-accent hover:underline">{c.id}</Link>
              </Table.Cell>
              <Table.Cell className={cell}>{formatEventTime(new Date(c.startMs).toISOString(), timezone)}</Table.Cell>
              <Table.Cell className={cell}>{formatDuration(c.durationMs)}</Table.Cell>
              <Table.Cell className={cell}>{c.events.length}</Table.Cell>
              <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2">{attrsAvailable ? <span className="block truncate" title={c.attrs.vendor}>{c.attrs.vendor}</span> : "-"}</Table.Cell>
              <Table.Cell className="max-w-[200px] px-6 text-sm">
                {attrsAvailable ? <Link href={`${base}/analysis/objects/${encodeURIComponent(c.objects.po)}`} title={c.objects.po} className="block truncate text-accent hover:underline">{c.objects.po}</Link> : <span className="text-ink-2">-</span>}
              </Table.Cell>
              <Table.Cell className={`${cell} font-mono`}>{variantOf(c)}</Table.Cell>
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
    </>
  );
}
