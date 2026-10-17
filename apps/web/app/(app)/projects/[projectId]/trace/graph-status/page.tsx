"use client";

import { Graph } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { RebuildButton } from "@/components/trace/rebuild-button";
import { StaleBadge } from "@/components/trace/stale-badge";
import { TraceTabs } from "@/components/trace/trace-tabs";
import { formatDateTime } from "@/lib/format";
import { freshness } from "@/lib/mock/graph";
import { acceptsData } from "@/lib/mock/permissions";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function GraphStatusPage() {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state, can } = ctx;
  const status = state.graphStatus[project.id];
  const mayRebuild = can("graph.rebuild", project.id);

  return (
    <div className="flex flex-col gap-4">
      <TraceTabs active="/trace/graph-status" />
      {!status ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Graph size={28} className="text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Graph belum dibentuk</p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold">Status graph</h2>
                <StaleBadge status={status} />
              </div>
              {mayRebuild && (acceptsData(project.status)
                ? <RebuildButton projectId={project.id} status={status} />
                : <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; pembangunan ulang dinonaktifkan</p>)}
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
              {([
                ["Versi", status.version],
                ["Proyeksi terakhir", formatDateTime(status.projectedAt)],
                ["Posisi otoritatif", formatDateTime(status.authoritativeAt)],
                ["Keterlambatan", `${mmss(freshness(status).lagSeconds)} menit`],
                ["Ambang basi", "5 menit"],
              ] as const).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-ink-3">{k}</dt><dd className="mt-0.5 font-medium text-ink">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Event gagal</h2>
            {status.failed.length ? (
              <Table aria-label="Event gagal" size="sm">
                <Table.Header>
                  <Table.Head id="event" isRowHeader label="EVENT" />
                  <Table.Head id="reason" label="ALASAN" className="w-full" />
                  <Table.Head id="attempts" label="PERCOBAAN" />
                </Table.Header>
                <Table.Body>
                  {status.failed.map((f) => (
                    <Table.Row key={f.eventId} id={f.eventId}>
                      <Table.Cell className="px-6 font-mono text-sm text-ink">{f.eventId}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{f.reason}</Table.Cell>
                      <Table.Cell className="px-6 text-sm text-ink-2">{f.attempts}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <p className="px-4 py-6 text-sm text-ink-3">Tidak ada event gagal</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
