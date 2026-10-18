"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Sparkle } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { INTERPRETATION_STATUS_LABEL, InterpretationStatusBadge, OverriddenPill } from "@/components/project/interpretation-status";
import { RequestInterpretationModal } from "@/components/project/request-interpretation-modal";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, TARGET_KIND_LABEL, kindsPresent } from "@/lib/mock/interpretation";
import { acceptsData } from "@/lib/mock/permissions";
import { findingsForProject, interpretationsForProject } from "@/lib/mock/reducer";
import type { InterpretationStatus, TargetKind } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const FILTERS: { id: InterpretationStatus | null; label: string }[] = [
  { id: null, label: "Semua" },
  { id: "lolos_pemeriksaan", label: INTERPRETATION_STATUS_LABEL.lolos_pemeriksaan },
  { id: "gagal_pemeriksaan", label: INTERPRETATION_STATUS_LABEL.gagal_pemeriksaan },
];

export default function InterpretationsPage() {
  const ctx = useProject();
  const [status, setStatus] = useState<InterpretationStatus | null>(null);
  const [kind, setKind] = useState<TargetKind | "">("");
  const [requesting, setRequesting] = useState(false);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const findings = findingsForProject(state, project.id);
  const all = interpretationsForProject(state, project.id);
  const kindOf = (id: string) => findings.find((f) => f.id === id)?.kind;
  const rows = all.filter((i) => (!status || i.status === status) && (!kind || kindOf(i.findingId) === kind));
  const mayRequest = can("interpretation.request", project.id);
  const open = acceptsData(project.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Filter status">
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
          <NativeSelect aria-label="Filter jenis" size="sm" className="w-52" value={kind} onChange={(e) => setKind(e.target.value as TargetKind | "")}
            options={[{ label: "Semua jenis", value: "" }, ...kindsPresent(findings).map((k) => ({ label: TARGET_KIND_LABEL[k], value: k }))]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button color="secondary" size="xs" iconLeading={FileText} href={`${base}/interpretations/templates`}>Templat prompt</Button>
          {mayRequest && open && findings.length > 0 && <Button color="primary" size="xs" iconLeading={Plus} onClick={() => setRequesting(true)}>Buat interpretasi</Button>}
          {mayRequest && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; permintaan interpretasi dinonaktifkan</p>}
        </div>
      </div>
      <Card>
        {rows.length ? (
          <Table aria-label="Interpretasi" size="sm">
            <Table.Header>
              <Table.Head id="finding" isRowHeader label="TARGET" className="w-full" />
              <Table.Head id="audience" label="AUDIENS" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="attempts" label="PERCOBAAN" />
              <Table.Head id="by" label="DIBUAT OLEH" />
              <Table.Head id="at" label="WAKTU" />
            </Table.Header>
            <Table.Body>
              {rows.map((i) => {
                const target = findings.find((f) => f.id === i.findingId);
                const title = target?.title ?? i.findingId;
                return (
                  <Table.Row key={i.id} id={i.id}>
                    <Table.Cell className="max-w-[320px] px-6 text-sm font-medium text-ink">
                      <Link href={`${base}/interpretations/${i.id}`} title={title} className="block truncate hover:underline">{title}</Link>
                      {target && <span title={TARGET_KIND_LABEL[target.kind]} className="block truncate text-xs font-normal text-ink-3">{TARGET_KIND_LABEL[target.kind]}</span>}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{AUDIENCE_LABEL[i.audience]}</Table.Cell>
                    <Table.Cell className="px-6"><div className="flex flex-wrap gap-1.5"><InterpretationStatusBadge status={i.status} />{i.overrides.length > 0 && <OverriddenPill />}</div></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{i.attempts.length}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{state.users.find((u) => u.id === i.createdBy)?.name ?? i.createdBy}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(i.createdAt)}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Sparkle size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">
              {!findings.length ? "Belum ada target untuk diinterpretasi" : all.length ? "Tidak ada interpretasi dengan filter ini" : "Belum ada interpretasi"}
            </p>
            {findings.length > 0 && !all.length && mayRequest && open && <p className="text-sm text-ink-3">Buat draf pertama dari salah satu target.</p>}
          </div>
        )}
      </Card>
      {mayRequest && open && <RequestInterpretationModal open={requesting} onClose={() => setRequesting(false)} projectId={project.id} />}
    </div>
  );
}
