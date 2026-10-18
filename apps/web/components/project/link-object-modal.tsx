"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { AUDIENCE_LABEL } from "@/lib/mock/interpretation";
import { LINK_KIND_LABEL } from "@/lib/mock/investigation";
import { useMock } from "@/lib/mock/store";
import type { InvestigationLink, LinkKind, MockState } from "@/lib/mock/types";

// Jenis yang didukung reducer `linkObject`.
const KINDS: LinkKind[] = ["temuan", "kasus", "aturan", "kandidat", "hasil_jev", "interpretasi"];

export function linkTargets(s: MockState, projectId: string, kind: LinkKind): { value: string; label: string }[] {
  const findings = s.findings.filter((f) => f.projectId === projectId);
  switch (kind) {
    case "temuan": return findings.map((f) => ({ value: f.id, label: f.title }));
    case "kasus": case "kandidat": case "hasil_jev":
      return findings.flatMap((f) => f.evidence).filter((e) => e.kind === kind).map((e) => ({ value: e.id, label: e.title }));
    case "aturan": {
      const byKey = new Map(s.rules.filter((r) => r.projectId === projectId).map((r) => [r.ruleKey, r.name]));
      return [...byKey].map(([value, label]) => ({ value, label }));
    }
    case "interpretasi":
      return s.interpretations.filter((i) => i.projectId === projectId).map((i) => ({
        value: i.id, label: `${findings.find((f) => f.id === i.findingId)?.title ?? i.findingId} (${AUDIENCE_LABEL[i.audience]})`,
      }));
    default: return [];
  }
}

export const linkTitle = (s: MockState, projectId: string, l: InvestigationLink) =>
  linkTargets(s, projectId, l.kind).find((t) => t.value === l.targetId)?.label ?? l.targetId;

export function LinkObjectModal({ open, onClose, investigationId }: { open: boolean; onClose: () => void; investigationId: string }) {
  const { state, dispatch } = useMock();
  const [kind, setKind] = useState<LinkKind>("temuan");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const projectId = state.investigations.find((i) => i.id === investigationId)?.projectId ?? "";
  const targets = linkTargets(state, projectId, kind);
  const selected = targets.some((t) => t.value === targetId) ? targetId : targets[0]?.value ?? "";

  const close = () => { setKind("temuan"); setTargetId(""); setError(undefined); onClose(); };
  function submit() {
    const err = dispatch({ type: "linkObject", investigationId, kind, targetId: selected });
    if (err) return setError(err);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title="Tautkan objek" description="Pilih jenis objek, lalu objek dari proyek ini."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!selected}>Tautkan</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      <NativeSelect label="Jenis" size="sm" value={kind} onChange={(e) => { setKind(e.target.value as LinkKind); setTargetId(""); setError(undefined); }}
        options={KINDS.map((k) => ({ label: LINK_KIND_LABEL[k], value: k }))} />
      {targets.length
        ? <NativeSelect label="Objek" size="sm" value={selected} onChange={(e) => setTargetId(e.target.value)} options={targets} />
        : <p className="text-sm text-ink-3">Tidak ada objek jenis ini di proyek.</p>}
    </NoraModal>
  );
}
