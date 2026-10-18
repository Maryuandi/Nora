"use client";

import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Pill } from "@/components/nora/badges";
import { formatDuration } from "@/lib/format";
import type { Variant } from "@/lib/mock/analysis";

const pct = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

/** One page of variants. Activity labels are plain text. `onShowCases` adds the per-row "Lihat kasus" action. */
export function VariantTable({ variants, selected, onToggle, onShowCases }: { variants: Variant[]; selected: string[]; onToggle: (id: string) => void; onShowCases?: (id: string) => void }) {
  return (
    <Table aria-label="Varian proses" size="sm">
      <Table.Header>
        <Table.Head id="pick" label="PILIH" />
        <Table.Head id="id" isRowHeader label="ID" />
        <Table.Head id="seq" label="URUTAN AKTIVITAS" className="w-full" />
        <Table.Head id="cases" label="KASUS" />
        <Table.Head id="pct" label="PERSEN" />
        <Table.Head id="cum" label="KUMULATIF" />
        <Table.Head id="median" label="MEDIAN DURASI" />
        <Table.Head id="act" label="AKSI" />
      </Table.Header>
      <Table.Body>
        {variants.map((v) => {
          const seq = v.sequence.join(" → ");
          return (
            <Table.Row key={v.id} id={v.id}>
              <Table.Cell className="px-6"><Checkbox aria-label={`Pilih varian ${v.id}`} isSelected={selected.includes(v.id)} onChange={() => onToggle(v.id)} /></Table.Cell>
              <Table.Cell className="px-6 font-mono text-sm whitespace-nowrap text-ink">{v.id}</Table.Cell>
              <Table.Cell className="max-w-[360px] px-6 text-sm text-ink">
                <span className="block truncate" title={seq}>{seq}</span>
                {v.ambiguous && <Pill className="mt-1">urutan ambigu</Pill>}
              </Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{v.caseCount.toLocaleString("id-ID")}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{pct(v.pct)}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{pct(v.cumPct)}</Table.Cell>
              <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDuration(v.medianDurationMs)}</Table.Cell>
              <Table.Cell className="px-6">
                {onShowCases && <Button color="secondary" size="xs" aria-label={`Lihat kasus varian ${v.id}`} onClick={() => onShowCases(v.id)}>Lihat kasus</Button>}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
