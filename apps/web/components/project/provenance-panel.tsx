"use client";

import Link from "next/link";
import { Card } from "@/components/nora/card";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import type { MonitoringRun } from "@/lib/mock/types";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-ink-3">{label}</dt>
    <dd className="mt-0.5 text-sm break-words text-ink">{children}</dd>
  </div>
);

export function ProvenancePanel({ run, ruleKey }: { run: MonitoringRun; ruleKey: string }) {
  const ctx = useProject();
  if (!ctx) return null;
  const { project, state } = ctx;
  const source = state.sources.find((s) => s.id === run.sourceId);
  const snapshot = state.snapshots.find((s) => s.id === run.snapshotId);
  const mapping = state.mappings.find((m) => m.id === run.mappingId);
  const versions = run.ruleVersions.filter((r) => r.ruleKey === ruleKey).sort((a, b) => a.version - b.version);
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Asal-usul hasil</h3>
      <dl className="grid gap-4 p-4 sm:grid-cols-2">
        <Row label="Sumber">{source?.name ?? run.sourceId}</Row>
        <Row label="Snapshot">{snapshot ? `${snapshot.fileName} · ${snapshot.checksum}` : run.snapshotId}</Row>
        <Row label="Pemetaan">{mapping ? `v${mapping.version}` : "—"}</Row>
        <Row label="Paket konteks">Belum ada (M04f)</Row>
        <Row label="Filter">Periode {run.periodFrom}–{run.periodTo}</Row>
        <Row label="Kalender">Kalender bawaan tiruan (M04a belum tersedia)</Row>
        <Row label="Waktu run">{formatDate(run.createdAt)}</Row>
        <Row label="Dijalankan oleh">{state.users.find((u) => u.id === run.createdBy)?.name ?? run.createdBy}</Row>
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-3">Versi aturan</dt>
          <dd className="mt-1 flex flex-col gap-3">
            {versions.map((v) => (
              <div key={v.id} className="text-sm text-ink">
                <Link href={`/projects/${project.id}/context/rules/${ruleKey}`} className="font-medium text-accent hover:underline">v{v.version}</Link>
                <span className="text-ink-2"> · {v.source.docTitle} · {v.source.section}</span>
                <blockquote className="mt-1 border-l-2 border-line pl-3 text-ink-2">{v.source.quote}</blockquote>
              </div>
            ))}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
