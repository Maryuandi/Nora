"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { initialsOf } from "@/components/nora/avatar";
import { Pill } from "@/components/nora/badges";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { linkTitle } from "@/components/project/link-object-modal";
import { NoteFormModal } from "@/components/project/note-form-modal";
import { useProject } from "@/components/project/use-project";
import { formatBytes, formatDate } from "@/lib/format";
import { HYPOTHESIS_LABEL, NOTE_KIND_LABEL } from "@/lib/mock/investigation";
import { acceptsData } from "@/lib/mock/permissions";
import type { HypothesisState, InvestigationNote, NoteKind } from "@/lib/mock/types";

const KINDS: NoteKind[] = ["wawancara", "bukti", "hipotesis", "pertanyaan"];
const EMPTY: Record<NoteKind, string> = {
  wawancara: "Belum ada catatan wawancara.", bukti: "Belum ada bukti.", hipotesis: "Belum ada hipotesis.", pertanyaan: "Belum ada pertanyaan.",
};
const STATE_DOT: Record<HypothesisState, string> = { belum_diuji: "bg-status-neutral", didukung: "bg-status-active", dibantah: "bg-status-ended" };

function isWebUrl(s: string) {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
}

function HypothesisControls({ note, options, onSave }: { note: InvestigationNote; options: { id: string; label: string }[]; onSave: (to: HypothesisState, ids: string[]) => void }) {
  const [to, setTo] = useState<HypothesisState>(note.hypothesisState ?? "belum_diuji");
  const [ids, setIds] = useState<string[]>(note.supportingLinkIds ?? []);
  const needsLinks = to !== "belum_diuji" && ids.length === 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-canvas p-3">
      <NativeSelect label="Ubah keadaan" size="sm" value={to} onChange={(e) => setTo(e.target.value as HypothesisState)}
        options={(Object.keys(HYPOTHESIS_LABEL) as HypothesisState[]).map((s) => ({ label: HYPOTHESIS_LABEL[s], value: s }))} />
      {to !== "belum_diuji" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-ink-2">Bukti pendukung (tautan workspace)</legend>
          {options.length ? options.map((o) => (
            <Checkbox key={o.id} size="sm" label={o.label} isSelected={ids.includes(o.id)}
              onChange={(on) => setIds((cur) => (on ? [...cur, o.id] : cur.filter((x) => x !== o.id)))} />
          )) : <p className="text-xs text-ink-3">Belum ada tautan di workspace ini.</p>}
        </fieldset>
      )}
      {needsLinks && <p className="text-xs text-ink-3">Pilih minimal satu tautan pendukung.</p>}
      <div><Button color="secondary" size="xs" isDisabled={needsLinks} onClick={() => onSave(to, to === "belum_diuji" ? [] : ids)}>Simpan keadaan</Button></div>
    </div>
  );
}

export function NotesTab({ investigationId }: { investigationId: string }) {
  const p = useProject();
  const [adding, setAdding] = useState<NoteKind | null>(null);
  const [error, setError] = useState<string | undefined>();
  if (!p) return null;
  const { state, dispatch, can, viewer, project } = p;
  const inv = state.investigations.find((i) => i.id === investigationId);
  if (!inv) return null;
  const notes = state.notes.filter((n) => n.investigationId === inv.id);
  const links = state.links.filter((l) => l.investigationId === inv.id);
  const open = acceptsData(project.status);
  const mayAdd = (k: NoteKind) => open && (can("note.add", project.id) || (can("note.add.field", project.id) && (k === "wawancara" || k === "bukti")));
  const nameOf = (id?: string) => state.users.find((u) => u.id === id)?.name ?? "—";

  const body = (n: InvestigationNote) => {
    switch (n.kind) {
      case "wawancara": return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{n.initialsOnly ? initialsOf(n.interviewee ?? "") : n.interviewee}</span>
          {n.intervieweeRole && <span>{n.intervieweeRole}</span>}
          {n.interviewDate && <span>{formatDate(n.interviewDate)}</span>}
          <Pill>Informasi kualitatif, bukan hasil terukur</Pill>
        </div>
      );
      case "bukti": return n.attachment && (
        <p className="min-w-0 break-all text-xs text-ink-3">
          {n.attachment.type === "file" ? `${n.attachment.label} (${formatBytes(n.attachment.sizeBytes ?? 0)})`
            : isWebUrl(n.attachment.label)
              ? <a href={n.attachment.label} target="_blank" rel="noreferrer noopener" className="break-all text-accent hover:underline">{n.attachment.label}</a>
              : n.attachment.label}
        </p>
      );
      case "hipotesis": return (
        <div className="flex flex-col gap-2">
          <Pill dot={STATE_DOT[n.hypothesisState ?? "belum_diuji"]}>{HYPOTHESIS_LABEL[n.hypothesisState ?? "belum_diuji"]}</Pill>
          {!!n.supportingLinkIds?.length && (
            <p className="text-xs text-ink-3">Didasarkan pada: {n.supportingLinkIds.map((id) => links.find((l) => l.id === id)).filter((l) => l).map((l) => linkTitle(state, project.id, l!)).join(", ")}</p>
          )}
          {open && can("note.add", project.id) && <HypothesisControls key={`${n.id}-${n.hypothesisState}`} note={n} options={links.map((l) => ({ id: l.id, label: linkTitle(state, project.id, l) }))}
            onSave={(to, ids) => setError(dispatch({ type: "setHypothesisState", noteId: n.id, state: to, supportingLinkIds: ids }))} />}
        </div>
      );
      case "pertanyaan": return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>Penanggung jawab: {nameOf(n.assigneeId)}</span>
          <Pill dot={n.questionState === "terjawab" ? "bg-status-active" : "bg-status-suspended"}>{n.questionState === "terjawab" ? "Terjawab" : "Terbuka"}</Pill>
          {open && n.questionState !== "terjawab" && can("note.add.field", project.id) && (can("note.add", project.id) || n.assigneeId === viewer.id) && (
            <Button color="secondary" size="xs" onClick={() => setError(dispatch({ type: "setQuestionState", noteId: n.id, state: "terjawab" }))}>Tandai terjawab</Button>
          )}
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <Banner tone="warning">{error}</Banner>}
      {KINDS.map((k) => {
        const items = notes.filter((n) => n.kind === k);
        return (
          <section key={k} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">{NOTE_KIND_LABEL[k]} <span className="font-normal text-ink-3">({items.length})</span></h2>
              {mayAdd(k) && <Button color="primary" size="xs" iconLeading={Plus} onClick={() => setAdding(k)}>Tambah catatan</Button>}
            </div>
            {items.length ? items.map((n) => (
              <Card key={n.id} className="flex flex-col gap-2 p-4">
                <h3 className="text-sm font-medium text-ink">{n.title}</h3>
                <p className="whitespace-pre-wrap text-sm text-ink-2">{n.body}</p>
                {body(n)}
                <p className="text-xs text-ink-3">{nameOf(n.createdBy)} · {formatDate(n.createdAt)}</p>
              </Card>
            )) : <Card className="px-4 py-8 text-center text-sm text-ink-3">{EMPTY[k]}</Card>}
          </section>
        );
      })}
      {adding && <NoteFormModal open onClose={() => setAdding(null)} investigationId={inv.id} kind={adding} />}
    </div>
  );
}
