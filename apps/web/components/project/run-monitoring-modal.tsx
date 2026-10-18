"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { runnableSources } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";

const INPUT = "rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink";

export function RunMonitoringModal({ open, onClose, projectId, onDone }: { open: boolean; onClose: () => void; projectId: string; onDone: (runId: string) => void }) {
  const { state, run } = useMock();
  const options = runnableSources(state, projectId);
  const [sourceId, setSourceId] = useState<string | undefined>();
  const [dates, setDates] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const sel = options.find((o) => o.source.id === sourceId) ?? options[0];
  const from = dates?.from ?? sel?.snapshot.stats?.timeFrom ?? "";
  const to = dates?.to ?? sel?.snapshot.stats?.timeTo ?? "";

  const close = () => { setSourceId(undefined); setDates(null); setError(undefined); onClose(); };
  function submit() {
    if (!sel) return;
    const r = run({ type: "runMonitoring", projectId, sourceId: sel.source.id, periodFrom: from, periodTo: to });
    if (r.error || !r.runId) return setError(r.error ?? "Gagal menjalankan monitoring");
    onDone(r.runId);
    close();
  }

  return (
    <NoraModal open={open} onClose={close} title="Jalankan monitoring" description="Evaluasi kepatuhan memakai aturan disetujui atau ditinjau saat ini."
      footer={<>
        <Button color="secondary" size="xs" onClick={close}>Batal</Button>
        <Button color="primary" size="xs" onClick={submit} isDisabled={!sel}>Jalankan</Button>
      </>}>
      {sel ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">Sumber data
            <select className={INPUT} value={sel.source.id} onChange={(e) => { setSourceId(e.target.value); setDates(null); setError(undefined); }}>
              {options.map((o) => <option key={o.source.id} value={o.source.id}>{o.source.name}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-ink">Dari
              <input type="date" className={INPUT} value={from} onChange={(e) => { setDates({ from: e.target.value, to }); setError(undefined); }} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-ink">Sampai
              <input type="date" className={INPUT} value={to} onChange={(e) => { setDates({ from, to: e.target.value }); setError(undefined); }} />
            </label>
          </div>
          {error && <Banner tone="warning">{error}</Banner>}
        </div>
      ) : <p className="text-sm text-ink-3">Belum ada sumber dengan pemetaan (M03)</p>}
    </NoraModal>
  );
}
