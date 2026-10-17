"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Plus } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { FreshnessBadge } from "@/components/project/freshness-badge";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { snapshotsForSource, sourceFreshness } from "@/lib/mock/reducer";

function AddSourceModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const ctx = useProject()!;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  const close = () => { setName(""); setError(undefined); onClose(); };
  function submit() {
    const e = ctx.dispatch({ type: "createSource", projectId, name });
    if (e) return setError(e);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title="Tambah sumber data" description="Satu sumber menampung beberapa snapshot dari file yang sama."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit}>Tambah sumber</Button>
      </>}>
      <Input label="Nama sumber" placeholder="Contoh: Event log SAP" size="sm" value={name} onChange={(v) => { setName(v); setError(undefined); }} isInvalid={!!error} hint={error} />
    </NoraModal>
  );
}

export default function SourcesPage() {
  const ctx = useProject();
  const [adding, setAdding] = useState(false);
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}`;
  const sources = state.sources.filter((s) => s.projectId === project.id);
  const mayCreate = can("source.create", project.id);
  const open = acceptsData(project.status);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Sumber data</h2>
            <p className="text-sm text-ink-3">File event log yang diimpor ke proyek ini.</p>
          </div>
          {mayCreate && open && <Button color="primary" size="xs" iconLeading={Plus} onClick={() => setAdding(true)}>Tambah sumber</Button>}
          {mayCreate && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penambahan sumber dinonaktifkan</p>}
        </div>
        {sources.length ? (
          <Table aria-label="Sumber data" size="sm">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="NAMA" className="w-full" />
              <Table.Head id="kind" label="JENIS" />
              <Table.Head id="snaps" label="SNAPSHOT" />
              <Table.Head id="last" label="IMPOR TERAKHIR" />
              <Table.Head id="event" label="EVENT TERBARU" />
              <Table.Head id="fresh" label="KESEGARAN" />
            </Table.Header>
            <Table.Body>
              {sources.map((s) => {
                const f = sourceFreshness(state, s.id);
                const count = snapshotsForSource(state, s.id).filter((x) => x.status !== "dibatalkan").length;
                return (
                  <Table.Row key={s.id} id={s.id}>
                    <Table.Cell className="px-6 text-sm font-medium text-ink">
                      <Link href={`${base}/sources/${s.id}`} className="hover:underline">{s.name}</Link>
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">File</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{count}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{f.lastImportAt ? formatDate(f.lastImportAt) : "-"}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{f.latestEventAt ? formatDate(f.latestEventAt) : "-"}</Table.Cell>
                    <Table.Cell className="px-6">{f.latestEventAt ? <FreshnessBadge stale={f.stale} /> : <span className="text-sm text-ink-3">-</span>}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Database size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm text-ink-3">Belum ada sumber data. {mayCreate && open ? "Tambah sumber pertama untuk mulai mengunggah file." : ""}</p>
          </div>
        )}
      </Card>
      {adding && <AddSourceModal open onClose={() => setAdding(false)} projectId={project.id} />}
    </div>
  );
}
