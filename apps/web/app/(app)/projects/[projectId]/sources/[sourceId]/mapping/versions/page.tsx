"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClockCounterClockwise } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { NotFoundPanel } from "@/components/not-found-panel";
import { MappingForm } from "@/components/project/mapping-form";
import { Trunc } from "@/components/project/preview-table";
import { SourceTabs } from "@/components/project/source-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { REQUIRED_ROLES } from "@/lib/mock/mapping";
import { acceptsData } from "@/lib/mock/permissions";
import { mappingsForSource } from "@/lib/mock/reducer";

function VersionsContent() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const saved = useSearchParams().get("saved");
  const ctx = useProject();
  const [openId, setOpenId] = useState<string | null>(null);
  const source = ctx?.state.sources.find((s) => s.id === sourceId);
  if (!ctx || !source || source.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, state, can } = ctx;
  const base = `/projects/${project.id}/sources/${source.id}`;
  const versions = mappingsForSource(state, source.id);
  const shown = versions.find((m) => m.id === openId);
  const shownSnap = shown && state.snapshots.find((s) => s.id === shown.snapshotId);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${project.id}/sources`} className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Sumber data
      </Link>
      <div className="min-w-0">
        <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={source.name}>{source.name}</h2>
        <p className="mt-1 text-sm text-ink-3">Riwayat versi pemetaan. Versi lama tidak dapat diubah.</p>
      </div>
      <SourceTabs base={base} active="/mapping/versions" />
      {saved && versions.some((m) => String(m.version) === saved) && <Banner>Versi v{saved} disimpan</Banner>}

      {versions.length ? (
        <Card>
          <Table aria-label="Versi pemetaan" size="sm">
            <Table.Header>
              <Table.Head id="v" isRowHeader label="VERSI" />
              <Table.Head id="at" label="WAKTU" />
              <Table.Head id="by" label="PEMBUAT" />
              <Table.Head id="snap" label="SNAPSHOT" />
              <Table.Head id="sum" label="RINGKASAN" />
              <Table.Head id="note" label="CATATAN" className="w-full" />
            </Table.Header>
            <Table.Body>
              {versions.map((m) => {
                const k = REQUIRED_ROLES.filter((r) => Object.values(m.roles).includes(r)).length;
                return (
                  <Table.Row key={m.id} id={m.id}>
                    <Table.Cell className="px-6 text-sm font-medium whitespace-nowrap text-ink">
                      <button type="button" aria-pressed={m.id === openId} aria-label={`Lihat pemetaan v${m.version}`}
                        onClick={() => setOpenId(m.id === openId ? null : m.id)} className="cursor-pointer text-accent hover:underline">v{m.version}</button>
                    </Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(m.createdAt)}</Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{state.users.find((u) => u.id === m.createdBy)?.name ?? "-"}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2"><Trunc text={state.snapshots.find((s) => s.id === m.snapshotId)?.fileName ?? "-"} max={200} /></Table.Cell>
                    <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{k} kolom wajib · {m.labels.length} label diubah · zona {m.timezone}</Table.Cell>
                    <Table.Cell className="px-6 text-sm text-ink-2"><Trunc text={m.note ?? "-"} max={240} /></Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
          <ClockCounterClockwise size={28} className="text-ink-3" aria-hidden />
          <p className="text-sm text-ink-3">Belum ada versi pemetaan.</p>
          {can("mapping.edit", project.id) && acceptsData(project.status) && (
            <Link href={`${base}/mapping`} className="text-sm font-medium text-accent hover:underline">Buat pemetaan pertama</Link>
          )}
        </div>
      )}

      {shown && (
        <section aria-label={`Pemetaan v${shown.version}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-ink">Pemetaan v{shown.version}</h3>
          {shownSnap
            ? <MappingForm key={shown.id} snapshot={shownSnap} initial={shown} readOnly />
            : <p className="text-sm text-ink-3">Snapshot untuk versi ini sudah tidak tersedia.</p>}
        </section>
      )}
    </div>
  );
}

export default function VersionsPage() {
  return <Suspense><VersionsContent /></Suspense>;
}
