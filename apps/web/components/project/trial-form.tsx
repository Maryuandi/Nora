"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Banner } from "@/components/nora/banner";
import { Card } from "@/components/nora/card";
import { ROLE_LABEL } from "@/components/nora/badges";
import { useMock } from "@/lib/mock/store";
import type { TrialProposal } from "@/lib/mock/types";

const lines = (xs: string[]) => xs.join("\n");
const split = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);

export function TrialForm({ trial, editable }: { trial: TrialProposal; editable: boolean }) {
  const { run, state } = useMock();
  const suggested = state.recCandidates.find((c) => c.id === trial.candidateId)?.ownerRole;
  const [f, setF] = useState({
    scope: trial.scope, duration: trial.durationWeeks?.toString() ?? "", target: trial.target, owner: trial.owner,
    guardrails: lines(trial.guardrails), risks: lines(trial.risks), stop: lines(trial.stopConditions),
  });
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () => {
    const weeks = f.duration.trim() === "" ? null : Number(f.duration);
    const err = run({ type: "rec/updateTrial", trialId: trial.id, patch: {
      scope: f.scope, durationWeeks: weeks, target: f.target, owner: f.owner, guardrails: split(f.guardrails), risks: split(f.risks), stopConditions: split(f.stop) } }).error;
    setMsg(err ? { tone: "warning", text: err } : { tone: "info", text: "Draf tersimpan." });
  };
  const ro = !editable;
  return (
    <div className="flex flex-col gap-4">
      <Banner>Draf sampai diputuskan di M11; narasi penjelasan dibuat M10.</Banner>
      <Card className="flex flex-col gap-3 px-5 py-4">
        <h3 className="text-base font-semibold">Diisi otomatis</h3>
        <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
          <dt className="text-ink-3">Tindakan</dt><dd>{trial.action}</dd>
          <dt className="text-ink-3">Metrik keberhasilan</dt><dd>{trial.successMetric}</dd>
          <dt className="text-ink-3">Baseline (M06)</dt>
          <dd>{trial.baseline.length ? <ul>{trial.baseline.map((b) => <li key={b.label}>{b.label}: <span className="font-medium">{String(b.value).replace(".", ",")} {b.unit}</span></li>)}</ul> : "Tidak ada metrik rujukan"}</dd>
        </dl>
      </Card>
      <Card className="flex flex-col gap-4 px-5 py-4">
        <h3 className="text-base font-semibold">Diisi analis</h3>
        <TextArea label="Cakupan (unit, kategori, periode)" rows={2} value={f.scope} onChange={set("scope")} isDisabled={ro} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input size="sm" label="Durasi (minggu)" inputMode="numeric" value={f.duration} onChange={set("duration")} isDisabled={ro} />
          <Input size="sm" label="Target" placeholder="Mis. P90 ≤ 6 hari" value={f.target} onChange={set("target")} isDisabled={ro} />
          <Input size="sm" label="Pemilik" placeholder={suggested ? `Usulan peran: ${ROLE_LABEL[suggested]}` : "Nama atau peran"} value={f.owner} onChange={set("owner")} isDisabled={ro} />
        </div>
        <TextArea label="Metrik pengaman / guardrail (satu per baris)" rows={2} value={f.guardrails} onChange={set("guardrails")} isDisabled={ro} />
        <TextArea label="Risiko (satu per baris)" rows={2} value={f.risks} onChange={set("risks")} isDisabled={ro} />
        <TextArea label="Kondisi penghentian (satu per baris)" rows={2} value={f.stop} onChange={set("stop")} isDisabled={ro} />
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {editable ? <div><Button color="primary" size="xs" onClick={save}>Simpan draf</Button></div> : <p className="text-sm text-ink-3">Hanya Analis pada proyek aktif yang dapat mengubah draf.</p>}
      </Card>
    </div>
  );
}
