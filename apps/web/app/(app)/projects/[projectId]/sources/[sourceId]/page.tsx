"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileArrowUp } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { FreshnessBadge } from "@/components/project/freshness-badge";
import { SnapshotStatusBadge } from "@/components/project/snapshot-status";
import { UploadDialog } from "@/components/project/upload-dialog";
import { useProject } from "@/components/project/use-project";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { snapshotsForSource, sourceFreshness } from "@/lib/mock/reducer";

export default function SourceDetailPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const router = useRouter();
  const ctx = useProject();
  const [uploading, setUploading] = useState(false);
  const source = ctx?.state.sources.find((s) => s.id === sourceId);
  if (!ctx || !source || source.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const snaps = snapshotsForSource(state, source.id);
  const f = sourceFreshness(state, source.id);
  const mayUpload = can("snapshot.upload", project.id);
  const open = acceptsData(project.status);
  const num = (n: number) => n.toLocaleString("id-ID");

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/sources`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Sumber data
      </Link>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={source.name}>{source.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
              <span>{snaps.filter((x) => x.status !== "dibatalkan").length} snapshot</span>
              <span>Impor terakhir: {f.lastImportAt ? formatDate(f.lastImportAt) : "-"}</span>
              {f.latestEventAt && <FreshnessBadge stale={f.stale} />}
            </p>
          </div>
          {mayUpload && open && <Button color="primary" size="xs" iconLeading={FileArrowUp} onClick={() => setUploading(true)}>Unggah file</Button>}
          {mayUpload && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; unggah file dinonaktifkan</p>}
        </div>
        {snaps.length ? (
          <Table aria-label="Riwayat snapshot" size="sm" onRowAction={(key) => router.push(`${base}/snapshots/${key}`)}>
            <Table.Header>
              <Table.Head id="file" isRowHeader label="NAMA FILE" className="w-full" />
              <Table.Head id="by" label="PENGUNGGAH" />
              <Table.Head id="at" label="WAKTU" />
              <Table.Head id="size" label="UKURAN" />
              <Table.Head id="sum" label="CHECKSUM" />
              <Table.Head id="status" label="STATUS" />
              <Table.Head id="result" label="RINGKASAN" />
            </Table.Header>
            <Table.Body>
              {snaps.map((s) => (
                <Table.Row key={s.id} id={s.id}>
                  <Table.Cell className="max-w-[320px] px-6 text-sm font-medium text-ink">
                    <Link href={`${base}/snapshots/${s.id}`} title={s.fileName} className="block truncate hover:underline">{s.fileName}</Link>
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{state.users.find((u) => u.id === s.uploadedBy)?.name ?? "-"}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(s.uploadedAt)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatBytes(s.sizeBytes)}</Table.Cell>
                  <Table.Cell className="px-6 font-mono text-xs whitespace-nowrap text-ink-2">{s.checksum.slice(0, 8)}</Table.Cell>
                  <Table.Cell className="px-6"><SnapshotStatusBadge status={s.status} /></Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">
                    {s.stats ? `${num(s.stats.newEvents)} baru / ${num(s.stats.duplicateEvents)} duplikat / ${num(s.stats.rejected)} ditolak` : "-"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-ink-3">Belum ada snapshot. {mayUpload && open ? "Unggah file pertama untuk memulai." : ""}</p>
        )}
      </Card>
      {mayUpload && open && <UploadDialog open={uploading} onClose={() => setUploading(false)} sourceId={source.id} projectId={project.id} />}
    </div>
  );
}
