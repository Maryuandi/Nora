"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { NoraModal } from "@/components/nora/modal";
import { useProject } from "@/components/project/use-project";
import { effectiveClass } from "@/lib/mock/classification";
import { classCorrectionSchema } from "@/lib/mock/schemas";
import type { ClassItem, ClassResult, QuestionSpec } from "@/lib/mock/types";

const MAX = 500;

/** Rendered only while correcting, so it is always open; stays open on error. */
export function ClassCorrectionModal({ result, item, spec, onClose }: { result: ClassResult; item: ClassItem; spec: QuestionSpec; onClose: () => void }) {
  const ctx = useProject();
  const order = spec.categories.map((c) => c.key);
  const [category, setCategory] = useState(() => {
    const e = effectiveClass(result, ctx?.state.classCorrections ?? [], order);
    // A failed result has placeholder probabilities, so there is no model category to start from.
    const k = result.status === "gagal" && e.source === "model" ? "" : e.category;
    return order.includes(k) ? k : "";
  });
  const [reason, setReason] = useState("");
  const [gold, setGold] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function submit() {
    const parsed = classCorrectionSchema.safeParse({ category, reason, addToGoldSet: gold });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const err = ctx?.dispatch({ type: "correctClass", resultId: result.id, category, reason, addToGoldSet: gold });
    if (err) return setError(err);
    onClose();
  }

  return (
    <NoraModal open onClose={onClose} title="Koreksi kategori" description={item.text.length > 120 ? `${item.text.slice(0, 120)}…` : item.text}
      footer={<>
        <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit}>Simpan koreksi</Button>
      </>}>
      <RadioGroup aria-label="Kategori" value={category} onChange={(v) => { setCategory(v); setError(undefined); }}>
        {spec.categories.map((c) => <RadioButton key={c.key} value={c.key} label={c.label} />)}
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
