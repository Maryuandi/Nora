"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flask } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { RecTabs } from "@/components/project/rec-tabs";
import { ScenarioForm } from "@/components/project/scenario-form";
import { useProject } from "@/components/project/use-project";
import { acceptsData } from "@/lib/mock/permissions";
import { describeSpec } from "@/lib/mock/scenario";

const f = (n: number) => n.toFixed(1).replace(".", ",");

export default function ScenariosPage() {
  const ctx = useProject();
  const router = useRouter();
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}/recommendations`;
  const list = state.scenarios.filter((s) => s.projectId === project.id).slice().reverse();
  const editable = can("rec.edit", project.id) && acceptsData(project.status);
  return (
    <div className="flex flex-col gap-4">
      <RecTabs active="/recommendations/scenarios" />
      {editable && <ScenarioForm projectId={project.id} onCreated={(id) => router.push(`${base}/scenarios/${id}`)} />}
      {!editable && can("rec.edit", project.id) && <p className="text-sm text-ink-3">Proyek tidak aktif; skenario baru dinonaktifkan.</p>}
      <Card>
        {list.length ? (
          <Table aria-label="Skenario" size="sm">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="SKENARIO" className="w-full" />
              <Table.Head id="aff" label="TERDAMPAK" />
              <Table.Head id="med" label="MEDIAN" />
              <Table.Head id="p90" label="P90" />
              <Table.Head id="st" label="STATUS" />
            </Table.Header>
            <Table.Body>
              {list.map((s) => (
                <Table.Row key={s.id} id={s.id}>
                  <Table.Cell className="max-w-[360px] px-6 text-sm font-medium"><Link href={`${base}/scenarios/${s.id}`} title={describeSpec(s.spec)} className="block truncate hover:underline">{s.name}</Link></Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{s.result.affected}/{s.result.n}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{f(s.result.before.median)} → {f(s.result.after.median)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{f(s.result.before.p90)} → {f(s.result.after.p90)}</Table.Cell>
                  <Table.Cell className="px-6"><Pill>Estimasi</Pill></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center"><Flask size={28} className="text-ink-3" aria-hidden /><p className="text-sm font-medium">Belum ada skenario</p></div>
        )}
      </Card>
    </div>
  );
}
