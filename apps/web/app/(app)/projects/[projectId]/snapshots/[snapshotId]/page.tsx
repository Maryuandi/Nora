"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Prohibit } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { SnapshotStatusBadge } from "@/components/project/snapshot-status";
import { useProject } from "@/components/project/use-project";
import { formatDate } from "@/lib/format";
import { acceptsData } from "@/lib/mock/permissions";

const CANCELLABLE = ["memvalidasi", "perlu_tinjauan", "siap_dipetakan"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </Card>
  );
}

export default function SnapshotDetailPage() {
  const { snapshotId } = useParams<{ snapshotId: string }>();
  const ctx = useProject();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const snap = ctx?.state.snapshots.find((s) => s.id === snapshotId);
  const source = snap && ctx?.state.sources.find((s) => s.id === snap.sourceId);
  if (!ctx || !snap || !source || snap.projectId !== ctx.project.id) return <NotFoundPanel />;
  const { project, can, dispatch } = ctx;
  const base = `/projects/${project.id}`;
  const open = acceptsData(project.status);
  const mayConfirm = can("snapshot.confirm", project.id) && open && snap.status === "perlu_tinjauan";
  const mayCancel = can("snapshot.cancel", project.id) && open && CANCELLABLE.includes(snap.status);
  const st = snap.stats;
  const num = (n: number) => n.toLocaleString("id-ID");
  const pct = st && st.rows ? ((st.rejected / st.rows) * 100).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0";
  const act = (type: "confirmSnapshot" | "cancelSnapshot") => {
    setError(dispatch({ type, snapshotId: snap.id }));
    setCancelling(false);
  };
  const facts: [string, string][] = st
    ? [
        ["Baris", num(st.rows)],
        ["Ditolak", `${num(st.rejected)} (${pct}%)`],
        ["Encoding", st.encoding],
        ["Delimiter", st.delimiter],
        ["Rentang waktu", `${formatDate(st.timeFrom)} – ${formatDate(st.timeTo)}`],
        ["Event terbaru", formatDate(st.latestEventAt)],
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <Link href={`${base}/sources/${source.id}`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> {source.name}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-[20px] leading-7 font-semibold tracking-[-0.02em]" title={snap.fileName}>{snap.fileName}</h2>
          <span className="shrink-0"><SnapshotStatusBadge status={snap.status} /></span>
        </div>
        {mayCancel && <Button color="secondary-destructive" size="xs" className="shrink-0" onClick={() => setCancelling(true)}>Batalkan snapshot</Button>}
      </div>

      {error && <Banner tone="warning">{error}</Banner>}
      {snap.status === "perlu_tinjauan" && st && (
        <Banner tone="warning" action={mayConfirm ? <Button color="primary" size="xs" onClick={() => act("confirmSnapshot")}>Konfirmasi dan teruskan</Button> : undefined}>
          {pct}% baris ditolak (lebih dari 5%). Tinjau sebelum diteruskan.
        </Banner>
      )}
      {snap.status === "dibatalkan" && (
        <p className="flex items-center gap-1.5 text-sm text-ink-3"><Prohibit size={16} aria-hidden /> Snapshot ini dibatalkan dan tidak dipakai modul lain.</p>
      )}

      {snap.status === "gagal" ? (
        <div className="rounded-lg border border-[#f2c4bc] bg-[#fdf1ef] px-4 py-3 text-sm text-ink" role="alert">
          <p className="font-semibold text-status-ended">Validasi gagal</p>
          <p className="mt-1">{snap.failureReason ?? "Alasan tidak diketahui"}</p>
        </div>
      ) : (
        <>
          {!st && (snap.status === "memvalidasi" || snap.status === "menunggu_unggah") && <p className="text-sm text-ink-3">Sedang memvalidasi…</p>}
          {st && (
            <Section title="Statistik">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-ink-3">{k}</dt>
                    <dd className="mt-0.5 text-sm text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-line px-4 py-3">
                <p className="text-sm text-ink-2">
                  Impor ulang: {num(st.newEvents)} baru / {num(st.duplicateEvents)} duplikat dilewati / {num(st.conflictEvents)} konflik
                </p>
                {st.conflictEvents > 0 && <p className="mt-1 text-sm text-ink-3">Event konflik ditinjau di M03, tidak ditimpa.</p>}
              </div>
            </Section>
          )}
          {snap.columns && (
            <Section title="Kolom">
              <table aria-label="Kolom terdeteksi" className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-3"><th className="px-4 py-2 font-medium">KOLOM</th><th className="px-4 py-2 font-medium">CONTOH NILAI</th></tr>
                </thead>
                <tbody>
                  {snap.columns.map((c, i) => (
                    <tr key={`${i}-${c.name}`} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-medium text-ink">{c.name}</td>
                      <td className="px-4 py-2 text-ink-2">{c.samples.slice(0, 3).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          {snap.preview && (
            <Section title="Pratinjau">
              {/* Cells render as React text nodes only: file content is never interpreted as HTML. */}
              <div className="max-h-[360px] overflow-auto" tabIndex={0} role="region" aria-label="Pratinjau 100 baris pertama">
                <table aria-label="Pratinjau data" className="w-full text-left font-mono text-xs">
                  <tbody>
                    {snap.preview.slice(0, 100).map((row, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        {row.map((cell, j) => <td key={j} className="px-3 py-1.5 whitespace-nowrap text-ink-2">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
          {snap.errors && snap.errors.length > 0 && (
            <Section title="Baris ditolak">
              <div className="flex flex-col gap-4 px-4 py-4">
                {snap.errors.map((e) => (
                  <div key={e.kind}>
                    <p className="text-sm font-medium text-ink">{e.kind} <span className="font-normal text-ink-3">({num(e.count)})</span></p>
                    <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs text-ink-2">
                      {e.examples.slice(0, 50).map((x, i) => <li key={i} className="break-all">baris {x.row}: {x.text}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {mayCancel && (
        <NoraModal open={cancelling} onClose={() => setCancelling(false)} title="Batalkan snapshot?" description="File asli dan catatannya tetap tersimpan untuk audit."
          footer={<>
            <Button color="secondary" size="xs" onClick={() => setCancelling(false)}>Kembali</Button>
            <Button color="primary-destructive" size="xs" onClick={() => act("cancelSnapshot")}>Batalkan snapshot</Button>
          </>} />
      )}
    </div>
  );
}
