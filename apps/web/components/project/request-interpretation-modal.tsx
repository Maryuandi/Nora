"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { AUDIENCE_LABEL, TARGET_KIND_LABEL, kindsPresent } from "@/lib/mock/interpretation";
import { findingsForProject } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";
import type { Audience, TargetKind } from "@/lib/mock/types";

const AUDIENCE_HINT: Record<Audience, string> = { analis: "lebih teknis", pemilik_proses: "bahasa bisnis, istilah dijelaskan" };

export function RequestInterpretationModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { state, run } = useMock();
  const router = useRouter();
  const targets = findingsForProject(state, projectId);
  const kinds = kindsPresent(targets);
  const [kindPick, setKindPick] = useState<TargetKind | "">("");
  const [findingId, setFindingId] = useState("");
  const [audience, setAudience] = useState<Audience>("analis");
  const [error, setError] = useState<string | undefined>();
  const kind = kinds.find((k) => k === kindPick) ?? kinds[0];
  const ofKind = targets.filter((t) => t.kind === kind);
  const selected = ofKind.some((t) => t.id === findingId) ? findingId : ofKind[0]?.id ?? "";

  const close = () => { setKindPick(""); setFindingId(""); setAudience("analis"); setError(undefined); onClose(); };
  function submit() {
    const r = run({ type: "requestInterpretation", projectId, findingId: selected, audience });
    if (r.error) return setError(r.error);
    close();
    router.push(`/projects/${projectId}/interpretations/${r.interpretationId}`);
  }

  return (
    <NoraModal open={open} onClose={close} title="Buat interpretasi" description="Model menyusun draf dari target terpilih. Draf diperiksa otomatis sebelum bisa dipakai."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!selected}>Buat draf</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      <NativeSelect label="Jenis target" size="sm" value={kind ?? ""} onChange={(e) => { setKindPick(e.target.value as TargetKind); setFindingId(""); }} options={kinds.map((k) => ({ label: TARGET_KIND_LABEL[k], value: k }))} />
      <NativeSelect label="Target" size="sm" value={selected} onChange={(e) => setFindingId(e.target.value)} options={ofKind.map((t) => ({ label: t.title, value: t.id }))} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-2">Audiens</legend>
        {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
          <label key={a} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} className="mt-0.5 accent-[var(--color-accent)]" />
            <span><span className="font-medium text-ink">{AUDIENCE_LABEL[a]}</span> <span className="text-ink-3">- {AUDIENCE_HINT[a]}</span></span>
          </label>
        ))}
      </fieldset>
    </NoraModal>
  );
}
