"use client";

import { useRef, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { STATUS_META } from "@/components/nora/badges";
import { NoraModal } from "@/components/nora/modal";
import { useAnalysis, type SimplifyPct } from "@/components/project/analysis-filter";
import { useProject } from "@/components/project/use-project";
import { defaultSimplify, type Dfg } from "@/lib/mock/eventlog";
import { acceptsData } from "@/lib/mock/permissions";
import { useMock } from "@/lib/mock/store";

/** Mounted only while open, so reopening always starts from clean local state. */
export function SavedViewDialog({ open, onClose, projectId, pct }: { open: boolean; onClose: () => void; projectId: string; pct: SimplifyPct }) {
  if (!open) return null;
  return <SaveForm onClose={onClose} projectId={projectId} pct={pct} />;
}

function SaveForm({ onClose, projectId, pct }: { onClose: () => void; projectId: string; pct: SimplifyPct }) {
  const { run } = useMock();
  const { filter, mode, selection } = useAnalysis();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const saving = useRef(false);
  const edit = (set: (v: string) => void) => (v: string) => { set(v); setError(undefined); };

  function save() {
    if (saving.current) return;
    saving.current = true;
    const r = run({ type: "saveView", projectId, name, note, filter, mode, selection, activityPct: pct.activityPct, transitionPct: pct.transitionPct });
    if (r.error) { saving.current = false; return setError(r.error); }
    onClose();
  }

  return (
    <NoraModal open onClose={onClose} title="Simpan tampilan" description="Menyimpan filter, mode peta, pilihan, dan penggeser saat ini."
      footer={<>
        <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
        <Button color="primary" size="xs" onClick={save}>Simpan</Button>
      </>}>
      <Input size="sm" label="Nama" placeholder="Contoh: Vendor dengan siklus lambat" value={name} onChange={edit(setName)} isRequired autoFocus
        hint={`${name.trim().length}/80 karakter`} />
      <TextArea label="Catatan" placeholder="Opsional" rows={3} value={note} onChange={edit(setNote)} hint={`${note.trim().length}/500 karakter. Tercatat di audit log.`} />
      {error && <Banner tone="warning">{error}</Banner>}
    </NoraModal>
  );
}

/** "Simpan tampilan" for the Map and Cases pages: hidden without view.save, disabled with a reason on an inactive project. */
export function SaveViewButton({ dfg }: { dfg: Dfg }) {
  const ctx = useProject();
  const { activityPct, transitionPct } = useAnalysis();
  const [open, setOpen] = useState(false);
  if (!ctx || !ctx.can("view.save", ctx.project.id)) return null;
  const active = acceptsData(ctx.project.status);
  const defaults = defaultSimplify(dfg); // sliders never touched = the map default for this data
  const pct = { activityPct: activityPct ?? defaults.activityPct, transitionPct: transitionPct ?? defaults.transitionPct };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button color="secondary" size="xs" iconLeading={BookmarkSimple} isDisabled={!active} onClick={() => setOpen(true)}>Simpan tampilan</Button>
      {!active && <span className="text-sm text-ink-3">Proyek berstatus {STATUS_META[ctx.project.status].label}; penyimpanan dinonaktifkan</span>}
      <SavedViewDialog open={open} onClose={() => setOpen(false)} projectId={ctx.project.id} pct={pct} />
    </div>
  );
}
