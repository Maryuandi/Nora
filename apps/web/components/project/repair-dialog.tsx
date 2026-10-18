"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { NoraModal } from "@/components/nora/modal";
import { ACTION_LABEL, excludedAfter, repairImpact, type QualityFinding, type QualityReport } from "@/lib/mock/quality";
import { repairRulesForSource } from "@/lib/mock/reducer";
import { useMock } from "@/lib/mock/store";
import type { RepairAction } from "@/lib/mock/types";

const num = (n: number) => n.toLocaleString("id-ID");

/** Mounted only while open (keyed by finding), so reopening always starts from clean local state. */
export function RepairDialog({ open, onClose, sourceId, finding, report }: { open: boolean; onClose: () => void; sourceId: string; finding: QualityFinding | null; report: QualityReport }) {
  if (!open || !finding) return null;
  return <RepairForm key={finding.id} onClose={onClose} sourceId={sourceId} finding={finding} report={report} />;
}

function RepairForm({ onClose, sourceId, finding, report }: { onClose: () => void; sourceId: string; finding: QualityFinding; report: QualityReport }) {
  const { state, run } = useMock();
  const projectId = state.sources.find((s) => s.id === sourceId)?.projectId;
  const unknown = finding.status === "tidak_diketahui"; // the reducer rejects exclusions for unknown findings
  const [action, setAction] = useState<RepairAction>(unknown ? "terima" : "kecualikan_event");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const saving = useRef(false);

  const exclusion = action !== "terima";
  const impact = exclusion && !unknown ? repairImpact(report, finding.id) : { events: 0, cases: 0 };
  const active = repairRulesForSource(state, sourceId, true);
  const large = exclusion && excludedAfter(report, active, { check: finding.id, ...impact }).events * 5 > report.totalEvents;
  const reasonError = attempted && !reason.trim() ? "Alasan wajib diisi" : undefined;
  const confirmError = attempted && large && !confirmed ? "Konfirmasi diperlukan" : undefined;
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setError(undefined); };

  function save() {
    if (saving.current) return;
    setAttempted(true);
    if (!reason.trim() || (large && !confirmed)) return;
    saving.current = true;
    const r = run({ type: "addRepairRule", sourceId, check: finding.id, action, reason, confirmLarge: large ? confirmed : undefined });
    if (r.error) { saving.current = false; return setError(r.error); }
    onClose();
  }

  return (
    <NoraModal open onClose={onClose} title={`Tangani: ${finding.title}`}
      description={unknown ? "Status penyelesaian kasus belum diketahui" : `${num(finding.affectedEvents)} event / ${num(finding.affectedCases)} kasus terdampak`}
      footer={<>
        <Button color="secondary" size="xs" onClick={onClose}>Batal</Button>
        <Button color="primary" size="xs" onClick={save}>Simpan aturan</Button>
      </>}>
      <RadioGroup aria-label="Aksi perbaikan" value={action} onChange={(v) => { edit(setAction)(v as RepairAction); setConfirmed(false); }}>
        {(unknown ? (["terima"] as const) : (["kecualikan_event", "kecualikan_kasus", "terima"] as const)).map((a) => (
          <RadioButton key={a} value={a} label={ACTION_LABEL[a]} />
        ))}
      </RadioGroup>
      {!unknown && (
        <p className="text-sm text-ink-3">
          Masalahnya ada di pemetaan?{" "}
          <Link href={`/projects/${projectId}/sources/${sourceId}/mapping`} onClick={onClose} className="font-medium text-accent hover:underline">Ubah pemetaan</Link>
        </p>
      )}
      <TextArea label="Alasan" placeholder="Tuliskan alasan aturan ini" rows={3} value={reason} onChange={edit(setReason)}
        isInvalid={!!reasonError} hint={reasonError ?? "Wajib diisi. Tercatat di audit log."} isRequired />
      <p className="text-sm text-ink-2" aria-live="polite">
        {exclusion && !unknown ? `${num(impact.events)} event dan ${num(impact.cases)} kasus akan dikecualikan` : "Tidak ada yang dikecualikan"}
      </p>
      {large && (
        <div>
          <Checkbox size="sm" label="Saya mengerti aturan ini mengecualikan lebih dari 20% event" isSelected={confirmed} onChange={edit(setConfirmed)} isInvalid={!!confirmError} />
          {confirmError && <p className="mt-1 text-sm text-status-ended" role="alert">{confirmError}</p>}
        </div>
      )}
      {error && <Banner tone="warning">{error}</Banner>}
    </NoraModal>
  );
}
