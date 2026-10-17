"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Plus, Scales } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META, Pill } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { ContextTabs } from "@/components/project/context-tabs";
import { RuleStatusBadge } from "@/components/project/rule-status";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { rulesForProject } from "@/lib/mock/reducer";
import { RULE_STATUS_LABEL, RULE_TYPE_LABEL, latestByKey, previewDataset, previewRule } from "@/lib/mock/rules";
import type { RuleStatus } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const FILTERS: { id: RuleStatus | null; label: string }[] = [
  { id: null, label: "Semua" },
  ...(["draf", "ditinjau", "disetujui", "usang"] as const).map((id) => ({ id, label: RULE_STATUS_LABEL[id] })),
];

export default function RulesPage() {
  const ctx = useProject();
  const [status, setStatus] = useState<RuleStatus | null>(null);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const all = latestByKey(rulesForProject(state, project.id));
  const rows = all.filter((r) => !status || r.status === status);
  const dataset = previewDataset(state, project.id);
  const mayCreate = can("rule.edit", project.id);
  const open = acceptsData(project.status);

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/rules" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Filter status">
          {FILTERS.map((f) => {
            const count = f.id ? all.filter((r) => r.status === f.id).length : all.length;
            return (
              <button key={f.label} role="tab" aria-selected={status === f.id} onClick={() => setStatus(f.id)}
                className={cx("rounded-md px-3 py-1 text-sm", status === f.id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}>
                {f.label} <span className="ml-1 text-ink-3">{count}</span>
              </button>
            );
          })}
        </div>
        {mayCreate && open && (
          <Link href={`${base}/context/rules/new`}>
            <Button color="primary" size="xs" iconLeading={Plus}>Aturan baru</Button>
          </Link>
        )}
        {mayCreate && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; pembuatan aturan dinonaktifkan</p>}
      </div>
      <Card>
        {rows.length ? (
          <Table aria-label="Aturan" size="sm">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="NAMA" className="w-full" />
              <Table.Head id="type" label="JENIS" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="ver" label="VERSI" />
              <Table.Head id="eff" label="BERLAKU" />
              <Table.Head id="src" label="RUJUKAN SUMBER" />
              <Table.Head id="client" label="KLIEN" />
              <Table.Head id="prev" label="PRATINJAU" />
            </Table.Header>
            <Table.Body>
              {rows.map((r) => {
                const p = previewRule(r, dataset);
                const src = `${r.source.docTitle} · ${r.source.section}`;
                return (
                  <Table.Row key={r.id} id={r.id}>
                    <Table.Cell className="max-w-[280px] px-6 text-sm font-medium text-ink">
                      <Link href={`${base}/context/rules/${r.ruleKey}`} title={r.name} className="block truncate hover:underline">{r.name}</Link>
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{RULE_TYPE_LABEL[r.params.type]}</Table.Cell>
                    <Table.Cell className="px-6"><RuleStatusBadge status={r.status} /></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">v{r.version}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                      {r.effectiveTo ? `${formatDate(r.effectiveFrom)} - ${formatDate(r.effectiveTo)}` : `mulai ${formatDate(r.effectiveFrom)}`}
                    </Table.Cell>
                    <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2">
                      <span title={src} className="block truncate">{src}</span>
                    </Table.Cell>
                    <Table.Cell className="px-6">
                      {r.clientConfirmed && <Pill><CheckCircle size={14} weight="fill" className="text-status-active" aria-hidden />Dikonfirmasi klien</Pill>}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap">
                      {p.status === "ok" ? <span className="text-ink-2">{p.compliant}/{p.evaluable} patuh</span> : <span className="text-ink-3">tidak dapat dievaluasi</span>}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Scales size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada aturan</p>
            {mayCreate && open && <p className="text-sm text-ink-3">Buat aturan pertama untuk mulai mendefinisikan konteks proses.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
