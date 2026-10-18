"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { initialsOf } from "@/components/nora/avatar";
import { NoraModal } from "@/components/nora/modal";
import { NOTE_KIND_LABEL } from "@/lib/mock/investigation";
import { useMock } from "@/lib/mock/store";
import type { NoteKind } from "@/lib/mock/types";

const MB = 1024 * 1024;
const EMPTY = { title: "", body: "", interviewee: "", role: "", date: "", initialsOnly: false, mode: "file" as "file" | "link", fileName: "", sizeMb: "", url: "", findingId: "", assigneeId: "" };

export function NoteFormModal({ open, onClose, investigationId, kind }: { open: boolean; onClose: () => void; investigationId: string; kind: NoteKind }) {
  const { state, dispatch, viewer } = useMock();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  const members = state.users.filter((u) => inv?.memberIds.includes(u.id));
  const findings = state.findings.filter((x) => x.projectId === inv?.projectId);
  const set = <K extends keyof typeof EMPTY>(k: K) => (v: (typeof EMPTY)[K]) => setF((p) => ({ ...p, [k]: v }));

  const close = () => { setF(EMPTY); setError(undefined); onClose(); };
  const sizeBytes = Math.round(Number(f.sizeMb) * MB);
  const valid =
    kind === "wawancara" ? !!f.interviewee.trim() && !!f.date && !!f.body.trim()
    : kind === "bukti" ? !!f.title.trim() && !!f.body.trim() && (f.mode === "file" ? !!f.fileName.trim() && sizeBytes > 0 : !!f.url.trim())
    : !!f.title.trim() && !!f.body.trim();

  function submit() {
    // Mode inisial: nama lengkap tidak boleh muncul di judul (dipakai juga untuk label audit).
    const who = f.initialsOnly ? initialsOf(f.interviewee) : f.interviewee.trim();
    const title = kind === "wawancara" ? `Wawancara ${who}` : f.title.trim();
    const err = dispatch({
      type: "addNote", investigationId,
      note: {
        kind, title, body: f.body.trim(),
        ...(kind === "wawancara" ? { interviewee: f.interviewee.trim(), intervieweeRole: f.role.trim() || undefined, interviewDate: f.date, initialsOnly: f.initialsOnly } : {}),
        ...(kind === "bukti" ? { attachment: f.mode === "file" ? { type: "file" as const, label: f.fileName.trim(), sizeBytes } : { type: "link" as const, label: f.url.trim() } } : {}),
        ...(kind === "hipotesis" && f.findingId ? { findingId: f.findingId } : {}),
        ...(kind === "pertanyaan" ? { assigneeId: f.assigneeId || viewer.id } : {}),
      },
    });
    if (err) return setError(err);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title={`Tambah catatan: ${NOTE_KIND_LABEL[kind].toLowerCase()}`}
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!valid}>Simpan</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      {kind === "wawancara" ? (<>
        <Input label="Narasumber" size="sm" isRequired value={f.interviewee} onChange={set("interviewee")} />
        <Input label="Peran" size="sm" value={f.role} onChange={set("role")} />
        <Input label="Tanggal" size="sm" type="date" isRequired value={f.date} onChange={set("date")} />
        <Checkbox size="sm" label="Tampilkan inisial saja" isSelected={f.initialsOnly} onChange={set("initialsOnly")} />
        <TextArea label="Isi" isRequired rows={4} value={f.body} onChange={set("body")} />
      </>) : (<>
        <Input label="Judul" size="sm" isRequired value={f.title} onChange={set("title")} />
        <TextArea label="Isi" isRequired rows={4} value={f.body} onChange={set("body")} />
      </>)}
      {kind === "bukti" && (<>
        <fieldset className="flex gap-4">
          <legend className="mb-1 text-sm font-medium text-ink-2">Lampiran</legend>
          {([["file", "Berkas"], ["link", "Tautan"]] as const).map(([m, label]) => (
            <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="attachment" value={m} checked={f.mode === m} onChange={() => { set("mode")(m); setError(undefined); }} className="accent-[var(--color-accent)]" />
              <span className="font-medium text-ink">{label}</span>
            </label>
          ))}
        </fieldset>
        {f.mode === "file" ? (<>
          <Input label="Nama berkas" size="sm" isRequired value={f.fileName} onChange={set("fileName")} />
          <Input label="Ukuran (MB)" size="sm" type="number" isRequired hint="Maksimum 20 MB." value={f.sizeMb} onChange={set("sizeMb")} />
        </>) : (
          <Input label="URL" size="sm" type="url" isRequired hint="Harus diawali http atau https." value={f.url} onChange={set("url")} />
        )}
      </>)}
      {kind === "hipotesis" && (
        <NativeSelect label="Temuan terkait (opsional)" size="sm" value={f.findingId} onChange={(e) => set("findingId")(e.target.value)}
          options={[{ label: "Tidak ada", value: "" }, ...findings.map((x) => ({ label: x.title, value: x.id }))]} />
      )}
      {kind === "pertanyaan" && (
        <NativeSelect label="Penanggung jawab" size="sm" value={f.assigneeId || viewer.id} onChange={(e) => set("assigneeId")(e.target.value)}
          options={members.map((u) => ({ label: u.name, value: u.id }))} />
      )}
    </NoraModal>
  );
}
