"use client";

import { useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { NoraModal } from "@/components/nora/modal";
import { useMock } from "@/lib/mock/store";
import type { GraphStatus } from "@/lib/mock/types";

export const REBUILD_MS = 3000;

export function RebuildButton({ projectId, status }: { projectId: string; status: GraphStatus }) {
  const { dispatch } = useMock();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => setOpen(false);
  const confirm = () => {
    const e = dispatch({ type: "rebuildGraph", projectId });
    if (e) return setError(e);
    close();
  };

  return (
    <>
      <Button color="secondary" size="xs" iconLeading={ArrowsClockwise} isDisabled={status.rebuilding} onClick={() => { setError(null); setOpen(true); }}>
        {status.rebuilding ? "Sedang membangun ulang…" : "Bangun ulang"}
      </Button>
      <NoraModal
        open={open}
        onClose={close}
        title="Bangun ulang graph?"
        description="Graph akan diproyeksikan ulang dari data terbaru. Proses ini sekitar 3 detik dan tercatat di audit log."
        footer={<>
          <Button color="secondary" size="xs" onClick={close}>Batal</Button>
          <Button color="primary" size="xs" onClick={confirm}>Bangun ulang</Button>
        </>}
      >
        {error && <p role="alert" className="text-sm font-medium text-ink">{error}</p>}
      </NoraModal>
    </>
  );
}
