"use client";

import { useState } from "react";
import Link from "next/link";
import { MagnifyingGlassPlus, Plus } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { CreateInvestigationModal } from "@/components/project/create-investigation-modal";
import { InvestigationStatusPill } from "@/components/project/investigation-status";
import { RevalidationBanner } from "@/components/project/revalidation-banner";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { INVESTIGATION_STATUS_LABEL, unreviewedModelOutputs } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import { findingsForProject, investigationsForProject } from "@/lib/mock/reducer";
import type { InvestigationStatus, MockState } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const FILTERS: { id: InvestigationStatus | null; label: string }[] = [
  { id: null, label: "Semua" },
  ...(Object.keys(INVESTIGATION_STATUS_LABEL) as InvestigationStatus[]).map((id) => ({ id, label: INVESTIGATION_STATUS_LABEL[id] })),
];

// ISO timestamps compare lexicographically.
const lastActivity = (s: MockState, id: string, createdAt: string) =>
  [createdAt, ...s.notes.filter((n) => n.investigationId === id).map((n) => n.createdAt), ...s.comments.filter((c) => c.investigationId === id).map((c) => c.createdAt), ...s.decisions.filter((d) => d.investigationId === id).map((d) => d.at)].reduce((m, v) => (v > m ? v : m));

export default function InvestigationsPage() {
  const ctx = useProject();
  const [status, setStatus] = useState<InvestigationStatus | null>(null);
  const [creating, setCreating] = useState(false);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const findings = findingsForProject(state, project.id);
  const all = investigationsForProject(state, project.id);
  const rows = all.filter((i) => !status || i.status === status);
  const mayCreate = can("investigation.create", project.id);
  const open = acceptsData(project.status);

  return (
    <div className="flex flex-col gap-4">
      <RevalidationBanner projectId={project.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Filter status">
          {FILTERS.map((f) => {
            const count = f.id ? all.filter((i) => i.status === f.id).length : all.length;
            return (
              <button key={f.label} role="tab" aria-selected={status === f.id} onClick={() => setStatus(f.id)}
                className={cx("rounded-md px-3 py-1 text-sm", status === f.id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
                {f.label} <span className="ml-1 text-ink-3">{count}</span>
              </button>
            );
          })}
        </div>
        {mayCreate && open && <Button color="primary" size="xs" iconLeading={Plus} onClick={() => setCreating(true)}>Buat workspace</Button>}
        {mayCreate && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; pembuatan workspace dinonaktifkan</p>}
      </div>
      <Card>
        {rows.length ? (
          <Table aria-label="Workspace investigasi" size="sm">
            <Table.Header>
              <Table.Head id="title" isRowHeader label="JUDUL" className="w-full" />
              <Table.Head id="origin" label="ASAL TEMUAN" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="unreviewed" label="BELUM DITINJAU" />
              <Table.Head id="owner" label="PEMILIK" />
              <Table.Head id="at" label="AKTIVITAS TERAKHIR" />
            </Table.Header>
            <Table.Body>
              {rows.map((i) => {
                const origin = i.originFindingId ? findings.find((f) => f.id === i.originFindingId)?.title ?? i.originFindingId : "-";
                const unreviewed = unreviewedModelOutputs(state, i.id).length;
                return (
                  <Table.Row key={i.id} id={i.id}>
                    <Table.Cell className="max-w-[320px] px-6 text-sm font-medium text-ink">
                      <Link href={`${base}/investigations/${i.id}`} title={i.title} className="block truncate hover:underline">{i.title}</Link>
                    </Table.Cell>
                    <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2"><span title={origin} className="block truncate">{origin}</span></Table.Cell>
                    <Table.Cell className="px-6"><InvestigationStatusPill status={i.status} /></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{unreviewed}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{state.users.find((u) => u.id === i.ownerId)?.name ?? i.ownerId}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(lastActivity(state, i.id, i.createdAt))}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MagnifyingGlassPlus size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">{all.length ? "Tidak ada workspace dengan status ini" : "Belum ada workspace investigasi"}</p>
            {!all.length && mayCreate && open && <p className="text-sm text-ink-3">Buat workspace pertama dari sebuah temuan atau dari pertanyaan kosong.</p>}
          </div>
        )}
      </Card>
      {mayCreate && open && <CreateInvestigationModal open={creating} onClose={() => setCreating(false)} projectId={project.id} />}
    </div>
  );
}
