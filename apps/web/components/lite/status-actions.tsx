"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectStatus } from "@nora/authz";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { NoraModal } from "@/components/nora/modal";
import { api, errorText } from "./api";
import { PROJECT_STATUS_LABEL } from "./badges";

const CONFIRM: Partial<Record<ProjectStatus, string>> = {
  suspended: "Data dan pekerjaan baru akan ditolak sampai proyek diaktifkan kembali. Workflow yang sedang berjalan boleh selesai dan diberi penanda.",
  ended: "Proyek menjadi hanya-baca secara permanen. Status ini tidak dapat dikembalikan ke Aktif.",
  archived: "Proyek diarsipkan dan tidak dapat diubah lagi.",
};

export function StatusButton({ projectId, to, label, primary }: { projectId: string; to: ProjectStatus; label?: string; primary?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = CONFIRM[to];

  async function run() {
    setBusy(true);
    setError(null);
    const res = await api(`/projects/${projectId}/status`, { body: { status: to, reason } });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button color={primary ? "primary" : "secondary"} size="xs" isLoading={busy && !open} onClick={() => (confirm ? setOpen(true) : run())}>
        {label ?? `Ubah ke ${PROJECT_STATUS_LABEL[to]}`}
      </Button>
      {error && !open && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      {confirm && (
        <NoraModal
          open={open}
          onClose={() => setOpen(false)}
          title={`Ubah status ke ${PROJECT_STATUS_LABEL[to]}?`}
          description={confirm}
          footer={
            <>
              <Button color="secondary" size="xs" onClick={() => setOpen(false)}>Batal</Button>
              <Button color={to === "suspended" ? "primary" : "primary-destructive"} size="xs" isLoading={busy} onClick={run}>Ubah status</Button>
            </>
          }
        >
          <TextArea label="Alasan" rows={3} value={reason} onChange={setReason} />
          {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
        </NoraModal>
      )}
    </>
  );
}
