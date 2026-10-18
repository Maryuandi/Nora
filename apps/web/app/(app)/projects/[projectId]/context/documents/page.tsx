"use client";

import { useState } from "react";
import { FileText, NotePencil, Plus, Warning } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { ContextTabs } from "@/components/project/context-tabs";
import { DocDialog } from "@/components/project/doc-dialog";
import { useProject } from "@/components/project/use-project";
import { formatBytes, formatDate } from "@/lib/format";
import { DOC_KIND_LABEL } from "@/lib/mock/docs";
import { acceptsData } from "@/lib/mock/permissions";
import type { ContextDoc, DocKind } from "@/lib/mock/types";

export default function DocumentsPage() {
  const ctx = useProject();
  const [dialog, setDialog] = useState<{ base?: ContextDoc; kind?: DocKind } | null>(null);
  const [withdrawing, setWithdrawing] = useState<ContextDoc | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  const docs = state.docs.map((d, i) => ({ d, i })).filter(({ d }) => d.projectId === project.id)
    .sort((a, b) => b.d.uploadedAt.localeCompare(a.d.uploadedAt) || b.i - a.i).map(({ d }) => d);
  const mayWrite = can("doc.upload", project.id) && acceptsData(project.status);
  const user = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";
  // Rules cite documents by title; a withdrawn document flags the approved rules that rely on it.
  const citing = (d: ContextDoc) => state.rules.filter((r) => r.projectId === project.id && r.source.docTitle === d.title && r.status !== "usang");
  const close = () => { setWithdrawing(null); setReason(""); setError(undefined); };

  return (
    <div className="flex flex-col gap-4">
      <ContextTabs active="/context/documents" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Dokumen acuan yang dirujuk aturan. Versi baru tidak menimpa versi lama.</p>
        {mayWrite ? (
          <div className="flex gap-2">
            <Button size="xs" color="secondary" iconLeading={NotePencil} onClick={() => setDialog({ kind: "wawancara" })}>Catatan wawancara</Button>
            <Button size="xs" color="primary" iconLeading={Plus} onClick={() => setDialog({})}>Unggah dokumen</Button>
          </div>
        ) : can("doc.upload", project.id) && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; unggah dinonaktifkan</p>}
      </div>
      <Card>
        {docs.length ? (
          <Table aria-label="Dokumen acuan" size="sm">
            <Table.Header>
              <Table.Head id="title" isRowHeader label="JUDUL" className="w-full" />
              <Table.Head id="kind" label="JENIS" />
              <Table.Head id="ver" label="VERSI" />
              <Table.Head id="issuer" label="PEMBERI" />
              <Table.Head id="date" label="TANGGAL / BERLAKU" />
              <Table.Head id="size" label="FILE" />
              <Table.Head id="by" label="PENGUNGGAH" />
              <Table.Head id="st" label="STATUS" />
              <Table.Head id="act" label="" />
            </Table.Header>
            <Table.Body>
              {docs.map((d) => {
                const rules = citing(d);
                return (
                  <Table.Row key={d.id} id={d.id}>
                    <Table.Cell className="max-w-[300px] px-6 text-sm font-medium text-ink">
                      <span title={d.title} className="block truncate">{d.title}</span>
                      {d.text && <span title={d.text} className="block truncate text-xs font-normal text-ink-3">{d.text}</span>}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{DOC_KIND_LABEL[d.kind]}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">v{d.version}</Table.Cell>
                    <Table.Cell className="max-w-[160px] px-6 text-sm text-ink-2"><span title={d.issuer} className="block truncate">{d.issuer}</span></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDate(d.docDate)}{d.effectiveFrom ? ` / ${formatDate(d.effectiveFrom)}` : ""}</Table.Cell>
                    <Table.Cell className="max-w-[160px] px-6 text-sm text-ink-2">
                      {d.fileName ? <span title={d.fileName} className="flex items-center gap-1 truncate"><FileText size={14} aria-hidden className="shrink-0" />{d.fileName} <span className="text-ink-3">({formatBytes(d.sizeBytes)})</span></span> : <span className="text-ink-3">Teks di aplikasi</span>}
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{user(d.uploadedBy)}</Table.Cell>
                    <Table.Cell className="px-6">
                      {d.status === "ditarik" ? (
                        <span className="flex flex-col gap-1">
                          <Pill><Warning size={14} weight="fill" className="text-status-suspended" aria-hidden />Ditarik</Pill>
                          {rules.length > 0 && <span className="text-xs text-status-suspended">{rules.length} aturan perlu ditinjau</span>}
                        </span>
                      ) : <Pill dot="bg-status-active">Aktif</Pill>}
                    </Table.Cell>
                    <Table.Cell className="px-6">
                      {mayWrite && d.status === "aktif" && (
                        <span className="flex gap-1">
                          <Button size="xs" color="tertiary" onClick={() => setDialog({ base: d })}>Versi baru</Button>
                          <Button size="xs" color="tertiary" onClick={() => setWithdrawing(d)}>Tarik</Button>
                        </span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <FileText size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Belum ada dokumen acuan</p>
            {mayWrite && <p className="text-sm text-ink-3">Unggah SOP, BPMN, atau perjanjian SLA agar aturan dapat merujuk sumbernya.</p>}
          </div>
        )}
      </Card>
      {dialog && <DocDialog projectId={project.id} base={dialog.base} initialKind={dialog.kind} onClose={() => setDialog(null)} />}
      {withdrawing && (
        <NoraModal open onClose={close} title="Tarik dokumen?" description="Dokumen tidak dihapus; statusnya menjadi ditarik dan aturan yang merujuknya perlu ditinjau."
          footer={<>
            <Button color="secondary" size="xs" onClick={close}>Kembali</Button>
            <Button color="primary-destructive" size="xs" onClick={() => { const e = dispatch({ type: "withdrawDoc", docId: withdrawing.id, reason }); if (e) setError(e); else close(); }}>Tarik dokumen</Button>
          </>}>
          <Input size="sm" label="Alasan" value={reason} onChange={setReason} isInvalid={!!error} hint={error} />
        </NoraModal>
      )}
    </div>
  );
}
