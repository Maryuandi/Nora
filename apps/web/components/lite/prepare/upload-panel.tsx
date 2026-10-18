"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { formatBytes } from "@/lib/lite/format";
import { api, errorText } from "../api";

const MAX = 2 * 1024 ** 3;
const ACCEPT = ".csv,.xes,.gz,.zip,text/csv,application/zip,application/gzip";

/** Signed PUT straight from the browser to object storage; the web server only issues the URL and starts the ingest. */
function put(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("Unggahan terputus"));
    xhr.send(file);
  });
}

export function UploadPanel({ projectId, sourceId }: { projectId: string; sourceId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!file) return;
    if (file.size > MAX) return setError("File melebihi batas 2 GiB.");
    setError(null);
    setProgress(0);
    const init = await api<{ snapshotId: string; upload: { url: string; headers: Record<string, string> } }>(`/projects/${projectId}/sources/${sourceId}/uploads`, { body: { fileName: file.name, size: file.size } });
    if (!init.ok) { setProgress(null); return setError(errorText(init.error)); }
    try {
      const status = await put(init.data.upload.url, init.data.upload.headers, file, setProgress);
      if (status < 200 || status >= 300) throw new Error(`Object storage menolak unggahan (HTTP ${status})`);
    } catch (e) {
      setProgress(null);
      return setError(e instanceof Error ? e.message : "Unggahan gagal");
    }
    const done = await api(`/projects/${projectId}/snapshots/${init.data.snapshotId}/complete`, { body: {} });
    setProgress(null);
    if (!done.ok) return setError(errorText(done.error));
    setFile(null);
    if (input.current) input.current.value = "";
    router.push(`/lite/projects/${projectId}/prepare/sources/${sourceId}?snapshot=${init.data.snapshotId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-6 py-8 text-center hover:border-accent">
        <UploadSimple size={28} className="text-ink-3" aria-hidden />
        <span className="text-sm font-medium text-ink">{file ? file.name : "Pilih file event log"}</span>
        <span className="text-xs text-ink-3">{file ? formatBytes(file.size) : "CSV, XES, XES.GZ, atau ZIP berisi satu CSV/XES · maks. 2 GiB"}</span>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
      </label>
      {progress !== null && (
        <div className="flex items-center gap-3" role="status">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sidebar"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span className="w-12 text-right text-xs text-ink-2">{Math.round(progress * 100)}%</span>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      <div className="flex justify-end">
        <Button color="primary" size="xs" isDisabled={!file || progress !== null} isLoading={progress !== null} onClick={start}>Unggah dan validasi</Button>
      </div>
    </div>
  );
}
