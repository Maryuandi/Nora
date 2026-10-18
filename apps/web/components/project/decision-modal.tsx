"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { linkTitle } from "@/components/project/link-object-modal";
import { DECISION_LABEL, canDecide, decisionBlocker } from "@/lib/mock/investigation";
import { useMock } from "@/lib/mock/store";
import type { DecisionStatus } from "@/lib/mock/types";

const STATUSES = Object.keys(DECISION_LABEL) as DecisionStatus[];

/** `expectedVersion` ditangkap pemanggil saat modal dibuka (versi terbaru, 0 bila belum ada). */
export function DecisionModal({ open, onClose, investigationId, linkId, expectedVersion, validated }: {
  open: boolean; onClose: () => void; investigationId: string; linkId: string; expectedVersion: number; validated: boolean;
}) {
  const { state, dispatch, roleIn } = useMock();
  const [status, setStatus] = useState<DecisionStatus | "">("");
  const [reason, setReason] = useState("");
  const [replacedBy, setReplacedBy] = useState("");
  const [error, setError] = useState<string | undefined>();
  const inv = state.investigations.find((i) => i.id === investigationId);
  if (!inv) return null;
  const role = roleIn(inv.projectId);
  const options = STATUSES.filter((s) => canDecide(role, s)).map((s) => ({ s, blocker: decisionBlocker(s, validated, inv.status) }));
  const chosen = status || (options.find((o) => !o.blocker) ?? options[0])?.s || "";
  const blocker = options.find((o) => o.s === chosen)?.blocker;
  const others = state.links.filter((l) => l.investigationId === inv.id && l.kind === "kandidat" && l.id !== linkId);
  const replacement = replacedBy || others[0]?.id || "";

  const close = () => { setStatus(""); setReason(""); setReplacedBy(""); setError(undefined); onClose(); };
  function submit() {
    if (!chosen) return;
    const err = dispatch({
      type: "makeDecision", investigationId: inv!.id, targetLinkId: linkId, status: chosen, reason, expectedVersion,
      ...(chosen === "digantikan" ? { replacedByLinkId: replacement } : {}),
    });
    if (err) return setError(err);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title={expectedVersion ? "Ubah keputusan" : "Tetapkan keputusan"}
      description={`Versi saat ini: ${expectedVersion || "belum ada"}. Riwayat keputusan tidak dapat dihapus.`}
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit}
          isDisabled={!chosen || !!blocker || !reason.trim() || (chosen === "digantikan" && !replacement)}>Simpan keputusan</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      <NativeSelect label="Status" size="sm" value={chosen} onChange={(e) => { setStatus(e.target.value as DecisionStatus); setError(undefined); }}
        hint={[...new Set(options.map((o) => o.blocker).filter(Boolean))].join(" ") || undefined}
        options={options.map(({ s, blocker }) => ({ label: blocker ? `${DECISION_LABEL[s]} (tidak tersedia)` : DECISION_LABEL[s], value: s, disabled: !!blocker }))} />
      {chosen === "digantikan" && (
        others.length ? (
          <NativeSelect label="Kandidat pengganti" size="sm" value={replacement} onChange={(e) => setReplacedBy(e.target.value)}
            options={others.map((l) => ({ label: linkTitle(state, inv.projectId, l), value: l.id }))} />
        ) : <p className="text-sm text-ink-3">Tidak ada kandidat lain di workspace ini.</p>
      )}
      <TextArea label="Alasan" isRequired rows={3} value={reason} onChange={setReason} />
    </NoraModal>
  );
}
