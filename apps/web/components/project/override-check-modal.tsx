"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { CHECK_LABEL } from "@/lib/mock/interpretation";
import { useMock } from "@/lib/mock/store";
import type { Violation } from "@/lib/mock/types";

export function OverrideCheckModal({ open, onClose, interpretationId, violation }: {
  open: boolean; onClose: () => void; interpretationId: string; violation: Violation | null;
}) {
  const { dispatch } = useMock();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();

  const close = () => { setReason(""); setError(undefined); onClose(); };
  function submit() {
    if (!violation) return;
    const err = dispatch({ type: "overrideCheck", interpretationId, check: violation.check, claimId: violation.claimId, reason });
    if (err) return setError(err);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title="Kesampingkan pemeriksaan"
      description="Pemeriksaan heuristik ini akan dianggap lolos. Alasan dicatat di riwayat audit."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!reason.trim()}>Kesampingkan</Button>
      </>}>
      {error && <Banner tone="warning">{error}</Banner>}
      {violation && (
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">{CHECK_LABEL[violation.check]}</p>
          <p className="break-words text-ink-2">{violation.message}</p>
        </div>
      )}
      <TextArea label="Alasan" isRequired rows={3} value={reason} onChange={setReason} placeholder="Jelaskan mengapa pelanggaran ini dapat diterima" />
    </NoraModal>
  );
}
