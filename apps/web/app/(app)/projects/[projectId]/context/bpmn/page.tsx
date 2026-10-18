"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileArrowUp, TreeStructure } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { ConfigBadges } from "@/components/project/config-ui";
import { ContextTabs } from "@/components/project/context-tabs";
import { useProject } from "@/components/project/use-project";
import { BPMN_MAX_CHARS, bpmnConversion, parseBpmn } from "@/lib/mock/bpmn";
import { latestConfigs } from "@/lib/mock/configs";
import { acceptsData } from "@/lib/mock/permissions";
import { configsForProject } from "@/lib/mock/reducer";
import { projectCanonicalLabels } from "@/lib/mock/rules";

export default function BpmnPage() {
  const ctx = useProject();
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  const base = `/projects/${project.id}/context/bpmn`;
  const items = latestConfigs(configsForProject(state, project.id).filter((c) => c.data.kind === "bpmn"));
  const labels = projectCanonicalLabels(state, project.id);
  const mayWrite = can("config.edit", project.id) && acceptsData(project.status);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > BPMN_MAX_CHARS) return setError("File BPMN terlalu besar untuk diimpor");
    const xml = await file.text();
    setError(dispatch({ type: "saveConfig", projectId: project.id, input: { name: file.name.replace(/\.bpmn$/i, ""), data: { kind: "bpmn", fileName: file.name, xml, mappings: [] } } }));
  }

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/bpmn" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Model BPMN 2.0 ditampilkan hanya-baca dan dipetakan ke label aktivitas kanonis.</p>
        {mayWrite && (
          <>
            <input ref={picker} type="file" accept=".bpmn,.xml" className="hidden" aria-label="Pilih file BPMN" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            <Button size="xs" color="primary" iconLeading={FileArrowUp} onClick={() => picker.current?.click()}>Impor BPMN</Button>
          </>
        )}
      </div>
      {error && <Banner tone="warning">{error}</Banner>}
      <Card>
        {items.length ? (
          <Table aria-label="Model BPMN" size="sm">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="MODEL" className="w-full" />
              <Table.Head id="st" label="STATUS" />
              <Table.Head id="tasks" label="TASK" />
              <Table.Head id="map" label="TERPETAKAN" />
              <Table.Head id="conv" label="CONFORMANCE" />
            </Table.Header>
            <Table.Body>
              {items.map((c) => {
                const d = c.data.kind === "bpmn" ? c.data : null;
                const parsed = d ? parseBpmn(d.xml) : null;
                const tasks = parsed?.ok ? parsed.model.nodes.filter((n) => n.kind === "task") : [];
                const mapped = d ? tasks.filter((t) => d.mappings.some((m) => m.task === t.id && m.labels.length)).length : 0;
                const conv = parsed?.ok ? bpmnConversion(parsed.model) : null;
                return (
                  <Table.Row key={c.id} id={c.id}>
                    <Table.Cell className="max-w-[300px] px-6 text-sm font-medium text-ink">
                      <Link href={`${base}/${c.key}`} title={c.name} className="block truncate hover:underline">{c.name}</Link>
                      <span className="block truncate text-xs font-normal text-ink-3" title={d?.fileName}>{d?.fileName}</span>
                    </Table.Cell>
                    <Table.Cell className="px-6"><ConfigBadges config={c} /></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{tasks.length}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{mapped}/{tasks.length}{labels.length === 0 ? " (belum ada label)" : ""}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{conv ? (conv.ok ? "Dapat dikonversi" : "Acuan visual") : "-"}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <TreeStructure size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada model BPMN</p>
            {mayWrite && <p className="text-sm text-ink-3">Impor file .bpmn untuk membandingkan proses aktual dengan model yang diharapkan.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
