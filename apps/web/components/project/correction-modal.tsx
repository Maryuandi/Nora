"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { NoraModal } from "@/components/nora/modal";
import { useProject } from "@/components/project/use-project";
import { RELEVANCE_LABEL, RELEVANCE_ORDER, hasModelVerdict, topTwo } from "@/lib/mock/assessment";
import { correctionSchema } from "@/lib/mock/schemas";
import type { Assessment, Candidate, Relevance } from "@/lib/mock/types";

const MAX = 500;
const initial = (a: Assessment): Relevance => (hasModelVerdict(a) ? topTwo(a.relevance.probs).top[0] : "relevan");

export function CorrectionModal({ open, onClose, assessment, candidate }: { open: boolean; onClose: () => void; assessment: Assessment; candidate: Candidate }) {
  const ctx = useProject();
  const [relevance, setRelevance] = useState<Relevance>(() => initial(assessment));
  const [reason, setReason] = useState("");
  const [gold, setGold] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [wasOpen, setWasOpen] = useState(open);
  // Fresh form each time the modal opens (or is reused for another result).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setRelevance(initial(assessment)); setReason(""); setGold(false); setError(undefined); }
  }

  function submit() {
    const parsed = correctionSchema.safeParse({ relevance, reason, addToGoldSet: gold });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const err = ctx?.dispatch({ type: "correctAssessment", assessmentId: assessment.id, relevance, reason, addToGoldSet: gold });
    if (err) return setError(err);
    onClose();
  }

  return (
    <NoraModal open={open} onClose={onClose} title="Koreksi relevansi" description={`Kandidat: ${candidate.name}`}
      footer={<>
        <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit}>Simpan koreksi</Button>
      </>}>
      <RadioGroup aria-label="Relevansi" value={relevance} onChange={(v) => { setRelevance(v as Relevance); setError(undefined); }}>
        {RELEVANCE_ORDER.map((r) => <RadioButton key={r} value={r} label={RELEVANCE_LABEL[r]} />)}
      </RadioGroup>
      <div className="flex flex-col gap-1.5">
        <TextArea label="Alasan koreksi" isRequired rows={3} value={reason} isInvalid={!!error} onChange={(v) => { setReason(v); setError(undefined); }} />
        <div className="flex justify-between gap-3 text-sm">
          <span role="alert" className="text-status-ended">{error}</span>
          <span className={reason.length > MAX ? "text-status-ended" : "text-ink-3"}>{reason.length}/{MAX}</span>
        </div>
      </div>
      <Checkbox size="sm" label="Masukkan ke set acuan evaluasi" isSelected={gold} onChange={setGold} />
    </NoraModal>
  );
}
