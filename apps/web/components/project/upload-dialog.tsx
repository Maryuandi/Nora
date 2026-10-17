"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, FileArrowUp } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { NoraModal } from "@/components/nora/modal";
import { formatBytes, formatDate } from "@/lib/format";
import { useMock } from "@/lib/mock/store";

export function UploadDialog({ open, onClose, sourceId, projectId }: { open: boolean; onClose: () => void; sourceId: string; projectId: string }) {
  const { state, run } = useMock();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [duplicateOf, setDuplicateOf] = useState<string | undefined>();
  const [validatingId, setValidatingId] = useState<string | undefined>();
  const target = (id: string) => `/projects/${projectId}/snapshots/${id}`;

  useEffect(() => {
    if (!validatingId) return;
    const t = setTimeout(() => router.push(target(validatingId)), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validatingId, router]);

  const close = () => { setFile(null); setError(undefined); setDuplicateOf(undefined); onClose(); };
  function submit() {
    if (!file) return setError("Pilih file terlebih dahulu");
    const r = run({ type: "uploadSnapshot", sourceId, fileName: file.name, sizeBytes: file.size });
    if (r.error) return setError(r.error);
    if (r.duplicateOf) return setDuplicateOf(r.duplicateOf);
    setValidatingId(r.snapshotId);
  }

  if (validatingId)
    return (
      <NoraModal open={open} onClose={() => {}} title="Mengunggah file" footer={null}>
        <div className="flex items-center gap-2 text-sm text-ink-2" role="status">
          <CircleNotch size={18} weight="bold" className="animate-spin text-ink-3" aria-hidden />
          Memvalidasi…
        </div>
      </NoraModal>
    );

  if (duplicateOf) {
    const dup = state.snapshots.find((s) => s.id === duplicateOf);
    return (
      <NoraModal open={open} onClose={close} title="File duplikat" description={`File ini identik dengan snapshot ${dup ? formatDate(dup.uploadedAt) : "sebelumnya"}`}
        footer={<>
          <Button color="secondary" size="xs" onClick={close}>Tutup</Button>
          <Button color="primary" size="xs" onClick={() => router.push(target(duplicateOf))}>Pakai snapshot lama</Button>
        </>} />
    );
  }

  return (
    <NoraModal open={open} onClose={close} title="Unggah file" description="Format .csv, .xes, .xes.gz, atau .zip. Ukuran maksimal 500 MB."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit}>Unggah</Button>
      </>}>
      <div>
        {/* Only name and size are read; file contents never are. */}
        <input ref={fileInput} type="file" accept=".csv,.xes,.gz,.zip" className="hidden" aria-label="Pilih file"
          onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? { name: f.name, size: f.size } : null); setError(undefined); e.target.value = ""; }} />
        <div className="flex items-center gap-3">
          <Button color="secondary" size="xs" iconLeading={FileArrowUp} onClick={() => fileInput.current?.click()}>Pilih file</Button>
          {file ? (
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={file.name}>{file.name} <span className="text-ink-3">({formatBytes(file.size)})</span></span>
          ) : <span className="text-sm text-ink-3">Belum ada file dipilih</span>}
        </div>
        {error && <p className="mt-2 text-sm text-status-ended" role="alert">{error}</p>}
      </div>
    </NoraModal>
  );
}
