"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ListChecks } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { StaleBadge } from "@/components/trace/stale-badge";
import { TraceTabs } from "@/components/trace/trace-tabs";
import { buildGraph, lineage } from "@/lib/mock/graph";
import { findingsForProject } from "@/lib/mock/reducer";

export default function FindingsPage() {
  const ctx = useProject();
  const graph = useMemo(() => (ctx ? buildGraph(ctx.state, ctx.project.id) : null), [ctx?.state, ctx?.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx || !graph) return null;
  const { project, state } = ctx;
  const rows = findingsForProject(state, project.id);

  return (
    <div className="flex flex-col gap-4">
      <TraceTabs active="/trace" />
      <Card>
        {rows.length ? (
          <Table aria-label="Temuan" size="sm">
            <Table.Header>
              <Table.Head id="title" isRowHeader label="TEMUAN" className="w-full" />
              <Table.Head id="metric" label="METRIK" />
              <Table.Head id="analysis" label="ANALISIS" />
              <Table.Head id="nodes" label="SIMPUL JEJAK" />
              <Table.Head id="stale" label="" />
            </Table.Header>
            <Table.Body>
              {rows.map((f) => (
                <Table.Row key={f.id} id={f.id} href={`/projects/${project.id}/trace/findings/${f.id}`}>
                  <Table.Cell className="max-w-[360px] px-6 text-sm font-medium text-ink">
                    <Link href={`/projects/${project.id}/trace/findings/${f.id}`} title={f.title} className="block truncate hover:underline">{f.title}</Link>
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{f.metric}: {f.value}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{graph.nodes.find((n) => n.id === f.analysisId)?.label ?? f.analysisId}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{lineage(graph, f.id)?.nodes.length ?? 0}</Table.Cell>
                  <Table.Cell className="px-6"><StaleBadge status={state.graphStatus[project.id]} /></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <ListChecks size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada temuan</p>
          </div>
        )}
      </Card>
    </div>
  );
}
