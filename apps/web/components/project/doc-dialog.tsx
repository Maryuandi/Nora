"use client";

import { useRef, useState } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { NoraModal } from "@/components/nora/modal";
import { DOC_KIND_LABEL, validateDoc, type DocInput } from "@/lib/mock/docs";
import { formatBytes } from "@/lib/format";
import { MOCK_TODAY } from "@/lib/mock/data";
import { useMock } from "@/lib/mock/store";
import type { ContextDoc, DocKind } from "@/lib/mock/types";

const KIND_ITEMS = (Object.keys(DOC_KIND_LABEL) as DocKind[]).map((id) => ({ id, label: DOC_KIND_LABEL[id] }));

/** Upload a document, write an interview note, or add a new version of `base` (same docKey). Only file name and size are read. */
export function DocDialog({ projectId, base, initialKind, onClose }: { projectId: string; base?: ContextDoc; initialKind?: DocKind; onClose: () => void }) {
  const { run } = useMock();
  const picker = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocKind>(base?.kind ?? initialKind ?? "sop");
  const [title, setTitle] = useState(base?.title ?? "");
  const [issuer, setIssuer] = useState(base?.issuer ?? "");
  const [docDate, setDocDate] = useState(MOCK_TODAY);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const input: DocInput = { title, kind, issuer, docDate, effectiveFrom: effectiveFrom || null, fileName: kind === "wawancara" ? null : (file?.name ?? null), sizeBytes: kind === "wawancara" ? 0 : (file?.size ?? 0), text };
  const errors = validateDoc(input);
  const err = (f: string) => (attempted ? errors.find((e) => e.field === f)?.message : undefined);

  function submit() {
    setAttempted(true);
    if (errors.length) return;
    const r = run({ type: "addDoc", projectId, ...(base ? { docKey: base.docKey } : {}), input });
    if (r.error) setError(r.error); else onClose();
  }

  return (
    <NoraModal open onClose={onClose} title={base ? `Versi baru: ${base.title}` : kind === "wawancara" ? "Catatan wawancara" : "Unggah dokumen"}
      description={base ? `Menjadi versi ${base.version + 1}; versi lama tetap tersimpan.` : "Format PDF, DOCX, MD, TXT, atau BPMN. Maksimal 50 MB."}
      footer={<><Button color="secondary" size="xs" onClick={onClose}>Batal</Button><Button color="primary" size="xs" onClick={submit}>Simpan</Button></>}>
      {!base && <Select size="sm" label="Jenis" items={KIND_ITEMS} selectedKey={kind} onSelectionChange={(k) => setKind(k as DocKind)}>{(it) => <Select.Item id={it.id}>{it.label}</Select.Item>}</Select>}
      <Input size="sm" label="Judul" value={title} onChange={setTitle} isInvalid={!!err("title")} hint={err("title")} />
      <Input size="sm" label="Pemberi dokumen" value={issuer} onChange={setIssuer} isInvalid={!!err("issuer")} hint={err("issuer")} />
      <div className="grid grid-cols-2 gap-3">
        <Input size="sm" type="date" label="Tanggal dokumen" value={docDate} onChange={setDocDate} isInvalid={!!err("docDate")} hint={err("docDate")} />
        <Input size="sm" type="date" label="Berlaku mulai (opsional)" value={effectiveFrom} onChange={setEffectiveFrom} isInvalid={!!err("effectiveFrom")} hint={err("effectiveFrom")} />
      </div>
      {kind === "wawancara" ? (
        <TextArea label="Isi catatan" rows={5} value={text} onChange={setText} isInvalid={!!err("text")} hint={err("text")} />
      ) : (
        <div>
          <input ref={picker} type="file" accept=".pdf,.docx,.md,.txt,.bpmn" className="hidden" aria-label="Pilih file"
            onChange={(e) => { const f = e.target.files?.[0]; setFile(f ? { name: f.name, size: f.size } : null); e.target.value = ""; }} />
          <div className="flex items-center gap-3">
            <Button color="secondary" size="xs" iconLeading={FileArrowUp} onClick={() => picker.current?.click()}>Pilih file</Button>
            {file ? <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={file.name}>{file.name} <span className="text-ink-3">({formatBytes(file.size)})</span></span> : <span className="text-sm text-ink-3">Belum ada file dipilih</span>}
          </div>
          {err("file") && <p className="mt-2 text-sm text-status-ended" role="alert">{err("file")}</p>}
        </div>
      )}
      {error && <p className="text-sm text-status-ended" role="alert">{error}</p>}
    </NoraModal>
  );
}
