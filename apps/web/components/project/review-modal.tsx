"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { REJECT_LABEL } from "@/lib/mock/investigation";
import { useMock } from "@/lib/mock/store";
import type { RejectReason } from "@/lib/mock/types";

const CODES = Object.keys(REJECT_LABEL) as RejectReason[];
const EMPTY = { verdict: "", code: CODES[0], reason: "", forEvalSet: false };

/** Koreksi hasil Jev (`kind` "jev") atau tolak draf interpretasi (`kind` "draft"). */
export function ReviewModal({ open, onClose, investigationId, linkId, kind }: {
  open: boolean; onClose: () => void; investigationId: string; linkId: string; kind: "jev" | "draft";
}) {
  const { dispatch } = useMock();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | undefined>();
  const set = <K extends keyof typeof EMPTY>(k: K) => (v: (typeof EMPTY)[K]) => setF((p) => ({ ...p, [k]: v }));

  const close = () => { setF(EMPTY); setError(undefined); onClose(); };
  const valid = !!f.reason.trim() && (kind === "draft" || !!f.verdict.trim());
  function submit() {
    const err = dispatch(kind === "jev"
      ? { type: "reviewJev", investigationId, linkId, outcome: "dikoreksi", correctedVerdict: f.verdict, reason: f.reason, forEvalSet: f.forEvalSet }
      : { type: "reviewDraft", investigationId, linkId, outcome: "ditolak", rejectCode: f.code, reason: f.reason, forEvalSet: f.forEvalSet });
    if (err) return setError(err);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title={kind === "jev" ? "Koreksi hasil Jev" : "Tolak draf interpretasi"}
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!valid}>{kind === "jev" ? "Simpan koreksi" : "Tolak draf"}</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      {kind === "jev" ? (
        <TextArea label="Putusan yang benar" isRequired rows={2} value={f.verdict} onChange={set("verdict")} />
      ) : (
        <NativeSelect label="Kode alasan" size="sm" value={f.code} onChange={(e) => set("code")(e.target.value as RejectReason)}
          options={CODES.map((c) => ({ label: REJECT_LABEL[c], value: c }))} />
      )}
      <TextArea label="Alasan" isRequired rows={3} value={f.reason} onChange={set("reason")} />
      <Checkbox size="sm" label="Tandai untuk set acuan evaluasi" isSelected={f.forEvalSet} onChange={set("forEvalSet")} />
    </NoraModal>
  );
}
