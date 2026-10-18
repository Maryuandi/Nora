"use client";

import { Suspense } from "react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { MonitoringTabs } from "@/components/project/monitoring-tabs";
import { useProject } from "@/components/project/use-project";
import { METRIC_DEFINITIONS } from "@/lib/mock/metrics";

export default function MetricsPage() {
  return <Suspense><Content /></Suspense>;
}

function Content() {
  if (!useProject()) return null;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringTabs active="/monitoring/metrics" />
      <p className="text-sm text-ink-3">Definisi berversi; perubahan rumus membuat versi baru.</p>
      <Card>
        <Table aria-label="Definisi metrik" size="sm">
          <Table.Header>
            <Table.Head id="name" isRowHeader label="METRIK" />
            <Table.Head id="desc" label="DESKRIPSI" className="w-full" />
            <Table.Head id="formula" label="RUMUS" />
            <Table.Head id="pop" label="POPULASI" />
            <Table.Head id="unit" label="SATUAN" />
            <Table.Head id="ver" label="VERSI" />
          </Table.Header>
          <Table.Body>
            {METRIC_DEFINITIONS.map((m) => (
              <Table.Row key={m.id} id={m.id}>
                <Table.Cell className="px-6 text-sm font-medium whitespace-nowrap text-ink">{m.name}</Table.Cell>
                <Table.Cell className="max-w-xs px-6 text-sm text-ink-2"><span className="line-clamp-2" title={m.description}>{m.description}</span></Table.Cell>
                <Table.Cell className="max-w-xs px-6 text-sm text-ink-2"><span className="line-clamp-2" title={m.formula}>{m.formula}</span></Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{m.population}</Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{m.unit}</Table.Cell>
                <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">v{m.version}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Card>
    </div>
  );
}
