"use client";

import { useState } from "react";
import Link from "next/link";
import { TreeStructure } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { formatRange } from "@/lib/format";
import type { ObjectGroup } from "@/lib/mock/analysis";
import { pageOf } from "@/lib/mock/eventlog";

const cell = "px-6 text-sm whitespace-nowrap text-ink-2";


export const ObjectsBanner = () => <Banner>Pengelompokan atribut: kasus yang berbagi nilai atribut yang sama, bukan analisis object-centric penuh</Banner>;

/** Shown instead of the object list/detail when the mapping has no case attributes (no PO to group by). */
export function ObjectsUnavailable({ base }: { base: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <TreeStructure size={28} className="text-ink-3" aria-hidden />
        <p className="text-sm font-medium">Pengelompokan objek belum tersedia</p>
        <p className="max-w-md text-sm text-ink-3">Pemetaan belum memuat kolom atribut kasus (misalnya nomor PO), sehingga kasus belum bisa dikelompokkan berdasarkan nilai atributnya.</p>
        <Link href={`${base}/sources`} className="text-sm font-medium text-accent hover:underline">Buka sumber data</Link>
      </div>
    </Card>
  );
}

/** Paged object (PO) list. Mount with a `key` per source so the page resets. Object ids and variant ids are plain text. */
export function ObjectTable({ groups, base, timezone, size = 20 }: { groups: ObjectGroup[]; base: string; timezone: string; size?: number }) {
  const [page, setPage] = useState(1);
  const view = pageOf(groups, page, size);

  return (
    <>
      <Table aria-label="Daftar objek" size="sm">
        <Table.Header>
          <Table.Head id="objek" isRowHeader label="DOKUMEN PO" />
          <Table.Head id="kasus" label="KASUS" />
          <Table.Head id="rentang" label="RENTANG WAKTU" />
          <Table.Head id="varian" label="VARIAN YANG MUNCUL" className="w-full" />
          <Table.Head id="aksi" label="" />
        </Table.Header>
        <Table.Body>
          {view.items.map((g) => {
            const variants = g.variantIds.join(", ");
            return (
              <Table.Row key={g.id} id={g.id}>
                <Table.Cell className="max-w-[200px] px-6 text-sm font-medium">
                  <Link href={`${base}/analysis/objects/${encodeURIComponent(g.id)}`} title={g.id} className="block truncate text-accent hover:underline">{g.id}</Link>
                </Table.Cell>
                <Table.Cell className={cell}>{g.caseCount}</Table.Cell>
                <Table.Cell className={cell}>{formatRange(g.fromMs, g.toMs, timezone)}</Table.Cell>
                <Table.Cell className="max-w-[320px] px-6 text-sm text-ink-2">
                  <span className="block truncate" title={`${g.variantIds.length} varian: ${variants}`}>
                    {g.variantIds.length} varian: <span className="font-mono">{variants}</span>
                  </span>
                </Table.Cell>
                <Table.Cell className="px-6">
                  <Button color="secondary" size="xs" href={`${base}/analysis/objects/${encodeURIComponent(g.id)}`}>Buka</Button>
                </Table.Cell>
              </Table.Row>
            );
          })}
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
