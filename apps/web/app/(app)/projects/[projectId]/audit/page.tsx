"use client";

import { useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Input } from "@/components/base/input/input";
import { ResultBadge } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { actorName } from "@/components/project/audit-list";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import type { AuditResult } from "@/lib/mock/types";
import { cx } from "@/utils/cx";

const FILTERS: { id: AuditResult | null; label: string }[] = [
  { id: null, label: "Semua" },
  { id: "sukses", label: "Sukses" },
  { id: "ditolak", label: "Ditolak" },
  { id: "gagal", label: "Gagal" },
];

export default function AuditPage() {
  const ctx = useProject();
  const [result, setResult] = useState<AuditResult | null>(null);
  const [q, setQ] = useState("");
  if (!ctx) return null;
  const { project, state } = ctx;

  const all = state.audit.filter((a) => a.projectId === project.id);
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((a) => !result || a.result === result)
    .filter((a) => !needle || [a.action, a.objectLabel, a.objectType, actorName(state.users, a.actorId)].some((s) => s.toLowerCase().includes(needle)))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-sidebar p-0.5" role="tablist" aria-label="Filter hasil">
          {FILTERS.map((f) => {
            const count = f.id ? all.filter((a) => a.result === f.id).length : all.length;
            return (
              <button
                key={f.label}
                role="tab"
                aria-selected={result === f.id}
                onClick={() => setResult(f.id)}
                className={cx("rounded-md px-3 py-1 text-sm", result === f.id ? "bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:text-ink")}
              >
                {f.label} <span className="ml-1 text-ink-3">{count}</span>
              </button>
            );
          })}
        </div>
        <Input aria-label="Cari audit log" placeholder="Cari aksi, objek, atau pelaku" icon={MagnifyingGlass} value={q} onChange={setQ} size="sm" className="w-72" />
      </div>
      <Card>
        {rows.length ? (
          <Table aria-label="Audit log" size="sm">
            <Table.Header>
              <Table.Head id="at" isRowHeader label="WAKTU" />
              <Table.Head id="actor" label="PELAKU" />
              <Table.Head id="action" label="AKSI" />
              <Table.Head id="object" label="OBJEK" className="w-full" />
              <Table.Head id="result" label="HASIL" />
            </Table.Header>
            <Table.Body>
              {rows.map((a) => (
                <Table.Row key={a.id} id={a.id}>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(a.at)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink">{actorName(state.users, a.actorId)}</Table.Cell>
                  <Table.Cell className="px-6 font-mono text-xs whitespace-nowrap text-ink-2">{a.action}</Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink"><span className="text-ink-3">{a.objectType} · </span>{a.objectLabel}</Table.Cell>
                  <Table.Cell className="px-6"><ResultBadge result={a.result} /></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-ink-3">Tidak ada aktivitas yang cocok dengan filter ini.</p>
        )}
      </Card>
    </div>
  );
}
