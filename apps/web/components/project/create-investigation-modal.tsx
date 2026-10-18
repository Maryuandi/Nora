"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { findingsForProject } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";

type Mode = "temuan" | "kosong";

export function CreateInvestigationModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { state, run } = useMock();
  const router = useRouter();
  const findings = findingsForProject(state, projectId);
  const [mode, setMode] = useState<Mode>("temuan");
  const [findingId, setFindingId] = useState("");
  const [titleEdit, setTitleEdit] = useState<string | null>(null); // null = ikuti temuan terpilih
  const [questionEdit, setQuestionEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const fromFinding = mode === "temuan" && findings.length > 0;
  const finding = findings.find((f) => f.id === findingId) ?? findings[0];
  const title = titleEdit ?? (fromFinding ? finding?.title ?? "" : "");
  const question = questionEdit ?? (fromFinding ? finding?.summary ?? "" : "");

  const close = () => { setMode("temuan"); setFindingId(""); setTitleEdit(null); setQuestionEdit(null); setError(undefined); onClose(); };
  function submit() {
    const r = run({ type: "createInvestigation", projectId, title, question, findingId: fromFinding ? finding?.id : undefined });
    if (r.error) return setError(r.error);
    close();
    router.push(`/projects/${projectId}/investigations/${r.investigationId}`);
  }
  const pick = (id: string) => { setFindingId(id); setTitleEdit(null); setQuestionEdit(null); };

  return (
    <NoraModal open={open} onClose={close} title="Buat workspace" description="Tempat mengumpulkan bukti, catatan, dan keputusan atas satu pertanyaan investigasi."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!title.trim() || !question.trim()}>Buat workspace</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      <fieldset className="flex gap-4">
        <legend className="mb-1 text-sm font-medium text-ink-2">Asal</legend>
        {([["temuan", "Dari temuan"], ["kosong", "Kosong"]] as const).map(([m, label]) => (
          <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="origin" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--color-accent)]" />
            <span className="font-medium text-ink">{label}</span>
          </label>
        ))}
      </fieldset>
      {mode === "temuan" && (findings.length
        ? <NativeSelect label="Temuan" size="sm" value={finding?.id ?? ""} onChange={(e) => pick(e.target.value)} options={findings.map((f) => ({ label: f.title, value: f.id }))} />
        : <p className="text-sm text-ink-3">Belum ada temuan di proyek ini; isi judul dan pertanyaan secara manual.</p>)}
      <Input label="Judul" size="sm" isRequired value={title} onChange={setTitleEdit} />
      <TextArea label="Pertanyaan" isRequired rows={3} value={question} onChange={setQuestionEdit} />
    </NoraModal>
  );
}
