"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Pill, STATUS_META } from "@/components/nora/badges";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { CapabilityList } from "@/components/project/capability-list";
import { VerdictPill } from "@/components/project/quality-pills";
import { SourceTabs } from "@/components/project/source-tabs";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";
import { buildCapabilities, buildQualityReport, datasetHash, qualityDataset, type QualityReport } from "@/lib/mock/quality";
import { datasetVersionsForSource, latestDataset, repairRulesForSource } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";

const num = (n: number) => n.toLocaleString("id-ID");

/** Mounted only while open, so reopening starts from a clean note and error. */
function PublishDialog({ onClose, onDone, sourceId, report }: { onClose: () => void; onDone: (id: string) => void; sourceId: string; report: QualityReport }) {
  const { run } = useMock();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const busy = useRef(false);

  function publish() {
    if (busy.current) return;
    busy.current = true;
    const r = run({ type: "publishDataset", sourceId, note: note.trim() || undefined });
    if (r.error || !r.datasetId) { busy.current = false; return setError(r.error ?? "Gagal menerbitkan"); }
    onDone(r.datasetId);
  }

  return (
    <NoraModal open onClose={onClose} title="Terbitkan versi dataset"
      description={`${num(report.eventsIncluded)} dari ${num(report.totalEvents)} event · ${num(report.casesIncluded)} kasus disertakan`}
      footer={<>
        <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
        <Button color="primary" size="xs" onClick={publish}>Terbitkan</Button>
      </>}>
      <div className="flex items-center gap-2 text-sm text-ink-2">Penilaian: <VerdictPill verdict={report.verdict} /></div>
      <TextArea label="Catatan" placeholder="Catatan untuk versi ini (opsional)" rows={3} value={note}
        onChange={(v) => { setNote(v); setError(undefined); }} hint="Tercatat bersama versi ini." />
      {error && <Banner tone="warning">{error}</Banner>}
    </NoraModal>
  );
}

export default function DatasetPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const ctx = useProject();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const state = ctx?.state;
  const dataset = useMemo(() => (state ? qualityDataset(state, sourceId) : null), [state, sourceId]);
  const activeRules = useMemo(() => (state ? repairRulesForSource(state, sourceId, true) : []), [state, sourceId]);
  const report = useMemo(() => (dataset ? buildQualityReport(dataset, activeRules) : null), [dataset, activeRules]);
  const capabilities = useMemo(() => (dataset && report ? buildCapabilities(dataset, report) : []), [dataset, report]);

  const source = state?.sources.find((s) => s.id === sourceId);
  if (!ctx || !state || !source || source.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, can } = ctx;
  const base = `/projects/${project.id}/sources/${source.id}`;
  const mayPublish = can("dataset.publish", project.id);
  const open = acceptsData(project.status);
  const versions = datasetVersionsForSource(state, source.id);
  const latest = latestDataset(state, source.id);
  const shown = versions.find((v) => v.id === selectedId) ?? latest;
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? "-";
  const fileName = (id: string) => state.snapshots.find((s) => s.id === id)?.fileName ?? "-";
  const mappingVersion = (id: string) => state.mappings.find((m) => m.id === id)?.version;

  const unchanged = !!(dataset && latest && latest.hash === datasetHash(dataset.snapshot.id, dataset.mapping.id, activeRules.map((r) => r.id)));
  const blocked = report?.verdict === "belum_layak"
    ? `Data belum layak diterbitkan: ${report.reasons[0] ?? "periksa laporan kualitas"}`
    : unchanged && latest ? `Tidak ada perubahan dari v${latest.version}` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/projects/${project.id}/sources`} className="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden className="shrink-0" /> Sumber data
      </Link>
      <div className="min-w-0">
        <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={source.name}>{source.name}</h2>
        <p className="mt-1 text-sm text-ink-3">Versi dataset yang diterbitkan dari sumber ini.</p>
      </div>
      <SourceTabs base={base} active="/dataset" />

      {mayPublish && !open && <p className="text-sm text-ink-3">Proyek berstatus {STATUS_META[project.status].label}; penerbitan dinonaktifkan</p>}

      {!dataset || !report ? (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Belum ada data yang siap diterbitkan</p>
          <p className="mt-1 text-sm text-ink-3">Unggah file, lalu simpan pemetaan kolom terlebih dahulu.</p>
          <Link href={`${base}/mapping`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Buka Pemetaan</Link>
        </div>
      ) : (
        <Card className="flex flex-col gap-3 px-4 py-4">
          <h3 className="text-base font-semibold text-ink">Terbitkan versi dataset</h3>
          <div className="flex flex-wrap items-center gap-3">
            <VerdictPill verdict={report.verdict} />
            <span className="text-sm text-ink-2">{num(report.eventsIncluded)} dari {num(report.totalEvents)} event · {num(report.casesIncluded)} kasus disertakan</span>
          </div>
          <CapabilityList items={capabilities} />
          {mayPublish && open && (
            <div className="flex flex-wrap items-center gap-3">
              <Button color="primary" size="xs" isDisabled={!!blocked} onClick={() => setPublishing(true)}>Terbitkan</Button>
              {blocked && <span className="min-w-0 text-sm break-words text-ink-3">{blocked}</span>}
            </div>
          )}
        </Card>
      )}

      {versions.length > 0 && (
        <Card>
          <Table aria-label="Versi dataset" size="sm">
            <Table.Header>
              <Table.Head id="v" isRowHeader label="VERSI" />
              <Table.Head id="at" label="TANGGAL" />
              <Table.Head id="by" label="PEMBUAT" />
              <Table.Head id="snap" label="SNAPSHOT" className="w-full" />
              <Table.Head id="map" label="PEMETAAN" />
              <Table.Head id="rules" label="ATURAN PERBAIKAN" />
              <Table.Head id="hash" label="HASH" />
              <Table.Head id="verdict" label="PENILAIAN" />
              <Table.Head id="status" label="STATUS" />
            </Table.Header>
            <Table.Body>
              {versions.map((v) => (
                <Table.Row key={v.id} id={v.id}>
                  <Table.Cell className="px-6 text-sm font-medium whitespace-nowrap text-ink">
                    <button type="button" aria-pressed={v.id === shown?.id} aria-label={`Lihat dataset v${v.version}`}
                      onClick={() => setSelectedId(v.id)} className="cursor-pointer text-accent hover:underline">v{v.version}</button>
                  </Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(v.createdAt)}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{userName(v.createdBy)}</Table.Cell>
                  <Table.Cell className="max-w-[240px] px-6 text-sm text-ink-2"><span className="block truncate" title={fileName(v.snapshotId)}>{fileName(v.snapshotId)}</span></Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">v{mappingVersion(v.mappingId) ?? "-"}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{v.repairRuleIds.length}</Table.Cell>
                  <Table.Cell className="px-6 font-mono text-xs whitespace-nowrap text-ink-2">{v.hash.slice(0, 8)}</Table.Cell>
                  <Table.Cell className="px-6"><VerdictPill verdict={v.verdict} /></Table.Cell>
                  <Table.Cell className="px-6"><Pill>{v.id === latest?.id ? "Terbaru" : "Ada versi lebih baru"}</Pill></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}

      {shown && (
        <section aria-label={`Dataset v${shown.version}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-ink">Dataset v{shown.version}</h3>
          {shown.id !== latest?.id && <p className="text-sm text-ink-3">Versi lama (hanya baca)</p>}
          <Card className="flex flex-col gap-3 px-4 py-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-ink-3">Snapshot</dt>
              <dd className="min-w-0 break-all text-ink-2">{fileName(shown.snapshotId)}</dd>
              <dt className="text-ink-3">Pemetaan</dt>
              <dd className="text-ink-2">v{mappingVersion(shown.mappingId) ?? "-"}</dd>
              <dt className="text-ink-3">Disertakan</dt>
              <dd className="text-ink-2">{num(shown.eventsIncluded)} event · {num(shown.casesIncluded)} kasus</dd>
              <dt className="text-ink-3">Aturan perbaikan</dt>
              <dd className="min-w-0 text-ink-2">
                {shown.repairRuleIds.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {shown.repairRuleIds.map((rid) => {
                      const reason = state.repairRules.find((r) => r.id === rid)?.reason ?? "-";
                      return <li key={rid}><span className="block max-w-[480px] truncate" title={reason}>{reason}</span></li>;
                    })}
                  </ul>
                ) : "Tidak ada"}
              </dd>
              <dt className="text-ink-3">Catatan</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-ink-2">{shown.note ?? "-"}</dd>
            </dl>
            <CapabilityList items={shown.capabilities} />
          </Card>
        </section>
      )}

      {publishing && report && (
        <PublishDialog sourceId={source.id} report={report} onClose={() => setPublishing(false)}
          onDone={(id) => { setSelectedId(id); setPublishing(false); }} />
      )}
    </div>
  );
}
