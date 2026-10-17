import Link from "next/link";
import { Table } from "@/components/application/table/table";
import { Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import type { BuiltGraph } from "@/lib/mock/graph";
import type { EvidenceBundle } from "@/lib/mock/types";

export function BundleItemsTable({ bundle, graph }: { bundle: EvidenceBundle; graph: BuiltGraph }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const labelOf = (id: string) => byId.get(id)?.label ?? id; // id missing from graph: show the raw id
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">Item bukti ({bundle.items.length})</h3>
        <Card>
          <Table aria-label="Item bukti" size="sm">
            <Table.Header>
              <Table.Head id="kind" isRowHeader label="JENIS" />
              <Table.Head id="label" label="SIMPUL" />
              <Table.Head id="version" label="VERSI" />
              <Table.Head id="summary" label="RINGKASAN" className="w-full" />
              <Table.Head id="link" label="TAUTAN" />
            </Table.Header>
            <Table.Body>
              {bundle.items.map((i) => {
                const href = byId.get(i.nodeId)?.href;
                return (
                  <Table.Row key={i.nodeId} id={i.nodeId}>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{i.kind}</Table.Cell>
                    <Table.Cell className="max-w-[280px] px-6 text-sm font-medium text-ink"><span className="block truncate" title={labelOf(i.nodeId)}>{labelOf(i.nodeId)}</span></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{i.version === null ? "—" : `v${i.version}`}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2">{i.summary}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap">
                      {href ? <Link href={href} className="font-medium text-accent hover:underline">Buka</Link> : <Pill>Modul belum tersedia</Pill>}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">Dikecualikan ({bundle.excluded.length})</h3>
        <Card>
          {bundle.excluded.length ? (
            <Table aria-label="Item dikecualikan" size="sm">
              <Table.Header>
                <Table.Head id="kind" isRowHeader label="JENIS" />
                <Table.Head id="label" label="SIMPUL" className="w-full" />
                <Table.Head id="reason" label="ALASAN" />
              </Table.Header>
              <Table.Body>
                {bundle.excluded.map((x) => (
                  <Table.Row key={x.nodeId} id={x.nodeId}>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{x.kind}</Table.Cell>
                    <Table.Cell className="px-6 text-sm font-medium text-ink">{labelOf(x.nodeId)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{x.reason}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-ink-3">Tidak ada item dikecualikan.</p>
          )}
        </Card>
      </section>
    </>
  );
}
