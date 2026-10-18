import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { AutoRefresh } from "@/components/lite/auto-refresh";
import { StatePill } from "@/components/lite/badges";
import { PublishButton } from "@/components/lite/prepare/prepare-client";
import { DatasetStatus, QualityStatus, SeverityBadge } from "@/components/lite/prepare/status";
import { DataTable, KeyValue, SectionCard, Td } from "@/components/lite/ui";
import { getDataset, QUALITY_CHECK_LABEL } from "@/lib/lite/data";
import { formatDateTime, formatInt, formatPct } from "@/lib/lite/format";
import { loadPageProject, orNotFound } from "@/lib/lite/page";

export const metadata = { title: "Kualitas dataset" };

const CAPABILITY_LABEL: Record<string, string> = {
  processDiscovery: "Process discovery",
  serviceTime: "Service time",
  resourceAnalysis: "Analisis resource",
  processBoundary: "Batas proses",
  comparison: "Perbandingan",
};

export default async function DatasetPage({ params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  const { projectId, datasetId } = await params;
  const { viewer, project, may } = await loadPageProject(projectId);
  const d = await orNotFound(getDataset(viewer, projectId, datasetId));
  const base = `/lite/projects/${projectId}/prepare`;
  const canWrite = may("data.write") && project.status === "active";
  const publishable = d.status === "quality_review" && (d.qualityStatus === "ready" || d.qualityStatus === "ready_with_notes");

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh active={d.status === "processing" || d.status === "draft"} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`${base}/sources/${d.sourceId}`} className="text-xs text-ink-3 hover:text-accent">{d.sourceName}</Link>
          <h2 className="flex items-center gap-2 text-base font-semibold">{d.name} <DatasetStatus status={d.status} /></h2>
        </div>
        {canWrite && d.status === "quality_review" && (
          <div className="flex items-start gap-2">
            <Button color="secondary" size="xs" href={`${base}/sources/${d.sourceId}?snapshot=${d.snapshotId}&mapping=${d.mappingVersionId}`}>Perbaiki dengan aturan</Button>
            <PublishButton projectId={projectId} datasetId={d.id} enabled={publishable} />
          </div>
        )}
      </div>

      {d.status === "processing" && <SectionCard title="Memproses dataset"><p className="text-sm text-ink-2">Menerapkan mapping, menormalkan waktu ke UTC, menghitung fingerprint, dan menjalankan pemeriksaan kualitas…</p></SectionCard>}
      {d.status === "failed" && <SectionCard title="Pemrosesan gagal"><p role="alert" className="text-sm text-error-primary">{d.errorMessage ?? "Dataset gagal diproses."}</p></SectionCard>}

      {d.eventCount != null && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SectionCard title="Ringkasan kualitas" actions={<QualityStatus status={d.qualityStatus} />}>
            {d.qualityStatus === "not_ready" && <p className="mb-3 text-sm text-ink-2">Ada temuan tinggi pada event yang belum dikecualikan. Perbaikan disimpan sebagai aturan pada mapping versi baru, bukan dengan mengedit sel.</p>}
            {d.findings.length === 0 ? (
              <p className="text-sm text-ink-2">Tidak ada temuan kualitas.</p>
            ) : (
              <DataTable head={["Pemeriksaan", "Tingkat", "Event", "Kasus", "Dikecualikan", "Contoh sumber"]}>
                {d.findings.map((f) => (
                  <tr key={f.check}>
                    <Td className="font-medium">{QUALITY_CHECK_LABEL[f.check] ?? f.check}</Td>
                    <Td><SeverityBadge severity={f.severity} /></Td>
                    <Td>{formatInt(f.eventCount)} <span className="text-ink-3">({formatPct(f.eventShare)})</span></Td>
                    <Td>{formatInt(f.caseCount)} <span className="text-ink-3">({formatPct(f.caseShare)})</span></Td>
                    <Td>{formatInt(f.excludedEventCount)}</Td>
                    <Td>
                      <details>
                        <summary className="cursor-pointer text-xs text-accent">{f.samples.length} baris</summary>
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-2">
                          {f.samples.map((s, i) => (
                            <li key={i}>{s.eventId ? `Event ${s.eventId}` : `Baris ${s.row}`} · {s.caseId ?? "∅"} · {s.activity ?? "∅"}{s.detail ? ` · ${s.detail}` : ""}</li>
                          ))}
                        </ul>
                      </details>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
          <SectionCard title="Dataset">
            <KeyValue items={[
              { label: "Event", value: formatInt(d.eventCount) },
              { label: "Kasus", value: formatInt(d.caseCount) },
              { label: "Event dikecualikan", value: formatInt(d.excludedEventCount) },
              { label: "Aktivitas", value: formatInt(d.activityLabels?.length) },
              { label: "Periode (UTC)", value: d.periodStart ? `${formatDateTime(d.periodStart, "UTC")} – ${formatDateTime(d.periodEnd, "UTC")}` : "–" },
              { label: "Snapshot", value: d.snapshotFileName },
              { label: "Mapping", value: `versi ${d.mappingVersion}` },
              { label: "Algoritme", value: d.algorithmVersion },
            ]} />
            <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">Content hash <code className="break-all">{d.contentHash}</code></p>
            {d.publishedAt && <p className="mt-1 text-xs text-ink-3">Terbit {formatDateTime(d.publishedAt, project.timezone)}</p>}
          </SectionCard>
        </div>
      )}

      {d.capabilities && (
        <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold">Advanced: capability matrix</summary>
          <ul className="mt-3 divide-y divide-line">
            {Object.entries(d.capabilities).map(([k, c]) => (
              <li key={k} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-40 shrink-0 font-medium">{CAPABILITY_LABEL[k] ?? k}</span>
                <StatePill tone={c.level === "ok" ? "active" : c.level === "warning" ? "warning" : "neutral"}>{c.level === "ok" ? "Tersedia" : c.level === "warning" ? "Dengan peringatan" : "Tidak tersedia"}</StatePill>
                <span className="text-ink-2">{c.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {d.activityLabels && d.activityLabels.length > 0 && (
        <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold">Label aktivitas kanonis ({d.activityLabels.length})</summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {d.activityLabels.map((l) => <li key={l.label} className="flex justify-between gap-2"><span className="truncate">{l.label}</span><span className="text-ink-3">{formatInt(l.count)}</span></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
