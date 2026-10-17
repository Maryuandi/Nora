"use client";

import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Table } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { StatusBadge, STATUS_META } from "@/components/nora/badges";
import { Card } from "@/components/nora/card";
import { NoraModal } from "@/components/nora/modal";
import { NotFoundPanel } from "@/components/not-found-panel";
import { actorName } from "@/components/project/audit-list";
import { useProject } from "@/components/project/use-project";
import { formatDateTime } from "@/lib/format";
import { allowedTransitions } from "@/lib/mock/reducer";
import type { ProjectStatus } from "@/lib/mock/types";

const ACTION_LABEL: Record<ProjectStatus, string> = {
  aktif: "Aktifkan",
  ditangguhkan: "Tangguhkan",
  berakhir: "Akhiri",
  diarsipkan: "Arsipkan",
  draft: "Kembalikan ke draft",
};

const STATUS_HELP: Record<ProjectStatus, string> = {
  draft: "Proyek sedang disiapkan. Sinkronisasi dan analisis belum berjalan.",
  aktif: "Sinkronisasi data dan analisis baru diizinkan.",
  ditangguhkan: "Sinkronisasi dan analisis baru diblokir. Data tetap bisa dibaca.",
  berakhir: "Kontrak berakhir. Proyek hanya-baca.",
  diarsipkan: "Proyek diarsipkan dan tidak bisa diubah.",
};

export default function SettingsPage() {
  const ctx = useProject();
  const [target, setTarget] = useState<ProjectStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!ctx) return null;
  const { project, state, can, dispatch } = ctx;
  if (!can("project.status", project.id)) return <NotFoundPanel />;

  const close = () => { setTarget(null); setReason(""); setError(null); };
  const confirm = () => {
    const e = dispatch({ type: "changeProjectStatus", projectId: project.id, to: target!, reason });
    if (e) return setError(e);
    close();
  };
  const next = allowedTransitions(project.status);

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Status proyek</h2>
        <div className="mt-3 flex items-center gap-3">
          <StatusBadge status={project.status} />
          <p className="text-sm text-ink-2">{STATUS_HELP[project.status]}</p>
        </div>
        <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-3" aria-label="Alur status">
          {(["draft", "aktif", "ditangguhkan", "berakhir", "diarsipkan"] as ProjectStatus[]).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight size={12} aria-hidden />}
              <span className={s === project.status ? "font-semibold text-ink" : undefined}>{STATUS_META[s].label}</span>
            </li>
          ))}
        </ol>
        {next.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            {next.map((s) => (
              <Button key={s} size="xs" color={s === "aktif" ? "primary" : s === "berakhir" ? "secondary-destructive" : "secondary"} onClick={() => setTarget(s)}>
                {ACTION_LABEL[s]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-5 border-t border-line pt-4 text-sm text-ink-3">Tidak ada perubahan status yang tersedia.</p>
        )}
      </Card>

      <Card>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Riwayat status</h2>
        {project.statusHistory.length ? (
          <Table aria-label="Riwayat status" size="sm">
            <Table.Header>
              <Table.Head id="at" isRowHeader label="WAKTU" />
              <Table.Head id="change" label="PERUBAHAN" />
              <Table.Head id="reason" label="ALASAN" className="w-full" />
              <Table.Head id="by" label="OLEH" />
            </Table.Header>
            <Table.Body>
              {[...project.statusHistory].reverse().map((h, i) => (
                <Table.Row key={i} id={String(i)}>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{formatDateTime(h.at)}</Table.Cell>
                  <Table.Cell className="px-6"><span className="flex items-center gap-1.5"><StatusBadge status={h.from} /><ArrowRight size={12} aria-hidden /><StatusBadge status={h.to} /></span></Table.Cell>
                  <Table.Cell className="px-6 text-sm text-ink">{h.reason}</Table.Cell>
                  <Table.Cell className="px-6 text-sm whitespace-nowrap text-ink-2">{actorName(state.users, h.by)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <p className="px-4 py-6 text-sm text-ink-3">Belum ada perubahan status.</p>
        )}
      </Card>

      <NoraModal
        open={!!target}
        onClose={close}
        title={target ? `${ACTION_LABEL[target]} proyek?` : ""}
        description={target ? STATUS_HELP[target] : undefined}
        footer={<>
          <Button color="secondary" size="xs" onClick={close}>Batal</Button>
          <Button color={target === "berakhir" ? "primary-destructive" : "primary"} size="xs" onClick={confirm}>{target ? ACTION_LABEL[target] : ""}</Button>
        </>}
      >
        <TextArea label="Alasan" placeholder="Tuliskan alasan perubahan status" rows={3} value={reason} onChange={(v) => { setReason(v); setError(null); }} isInvalid={!!error} hint={error ?? "Wajib diisi. Tercatat di audit log."} isRequired />
      </NoraModal>
    </div>
  );
}
