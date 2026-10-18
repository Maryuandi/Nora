"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { NoraModal } from "@/components/nora/modal";
import { formatPct } from "@/lib/lite/format";
import { StatePill, type Tone } from "../badges";
import { api, errorText } from "../api";

const CONCLUSION: Record<string, string> = { relevant: "Relevan", partly_relevant: "Sebagian relevan", not_relevant: "Tidak relevan", insufficient_information: "Informasi tidak cukup" };
const STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Antre", tone: "info" }, running: { label: "Berjalan", tone: "info" }, automatic: { label: "Otomatis", tone: "active" },
  needs_review: { label: "Perlu review", tone: "warning" }, insufficient_information: { label: "Informasi tidak cukup", tone: "neutral" }, failed: { label: "Gagal", tone: "error" },
};

interface Assessment {
  id: string; status: string; candidateKey: string; candidateAction: string; conclusion: string | null; topProbability: number | null; margin: number | null;
  sufficiencyProbability: number | null; totalScore: number | null; missingCriteria: string[]; adapter: string; model: string | null; modelVersion: string | null;
  questionSpecs: { task: string; version: number }[]; rubricVersion: number | null; evidenceBundleId: string | null; contextLimited: boolean; contextMaybeStale: boolean;
  errorMessage: string | null; criteria: { key: string; weight: number; score: number | null; probability: number | null }[];
  corrections: { id: string; kind: string; conclusion: string | null; reason: string; by: string | null }[]; effective: { conclusion: string | null; source: string }; specSuperseded: boolean;
}
interface Data {
  assessments: Assessment[];
  blocked: { id: string; candidateKey: string; candidateAction: string; preconditionStatus: string; checks: { status: string; reason: string; condition: { ref: string; key: string } }[] }[];
  run: { id: string; status: string; errorMessage: string | null } | null;
}

function Review({ projectId, a, onDone }: { projectId: string; a: Assessment; onDone: () => void }) {
  const [mode, setMode] = useState<"confirm" | "correct" | null>(null);
  const [conclusion, setConclusion] = useState(a.conclusion ?? "relevant");
  const [reason, setReason] = useState("");
  const [gold, setGold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const res = await api(`/projects/${projectId}/assessments/${a.id}/corrections`, { body: { kind: mode, conclusion: mode === "correct" ? conclusion : null, reason, goldCandidate: gold } });
    setBusy(false);
    if (!res.ok) return setError(res.error.details?.reason ?? errorText(res.error));
    setMode(null);
    onDone();
  }
  return (
    <>
      <div className="flex gap-2">
        <Button size="xs" color="secondary" onClick={() => setMode("confirm")}>Konfirmasi</Button>
        <Button size="xs" color="secondary" onClick={() => setMode("correct")}>Koreksi</Button>
      </div>
      <NoraModal open={mode !== null} onClose={() => setMode(null)} title={mode === "confirm" ? "Konfirmasi hasil model" : "Koreksi hasil model"}
        description="Hasil asli model tetap tersimpan; keputusanmu dicatat terpisah beserta alasannya."
        footer={<><Button size="xs" color="secondary" onClick={() => setMode(null)}>Batal</Button><Button size="xs" color="primary" isLoading={busy} isDisabled={!reason.trim()} onClick={submit}>Simpan</Button></>}>
        {mode === "correct" && <NativeSelect label="Kesimpulan yang benar" size="sm" value={conclusion} onChange={(e) => setConclusion(e.target.value)} options={Object.entries(CONCLUSION).map(([value, label]) => ({ value, label }))} />}
        <TextArea label="Alasan" rows={3} value={reason} onChange={setReason} isRequired />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gold} onChange={(e) => setGold(e.target.checked)} />Tandai sebagai kandidat gold set</label>
        {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      </NoraModal>
    </>
  );
}

function Advanced({ projectId, canRun }: { projectId: string; canRun: boolean }) {
  const [specs, setSpecs] = useState<{ id: string; task: string; version: number; status: string; spec: { question: string; topThreshold: number; marginThreshold: number } }[]>([]);
  const [gold, setGold] = useState<{ items: { id: string; label: string; modelConclusion: string; candidateKey: string }[]; runs: { id: string; metrics: { items: number; accuracy: number; brierScore: number } }[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ specs: typeof specs }>(`/projects/${projectId}/assessment-specs`).then((r) => r.ok && setSpecs(r.data.specs));
    api<typeof gold>(`/projects/${projectId}/gold-sets`).then((r) => r.ok && setGold(r.data));
  }, [projectId]);
  return (
    <details className="rounded-lg border border-line bg-canvas px-4 py-3" onToggle={(e) => (e.target as HTMLDetailsElement).open && load()}>
      <summary className="cursor-pointer text-sm font-medium">Advanced: spesifikasi pertanyaan, gold set, evaluasi</summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1">{specs.map((s) => <li key={s.id}><span className="font-medium">{s.task} v{s.version}</span> <span className="text-xs text-ink-3">{s.status} · ambang {s.spec.topThreshold} · margin {s.spec.marginThreshold}</span><p className="text-xs text-ink-2">{s.spec.question}</p></li>)}</ul>
        {gold && (
          <div>
            <p className="font-medium">Gold set ({gold.items.length})</p>
            <ul className="text-xs text-ink-2">{gold.items.map((g) => <li key={g.id}>{g.candidateKey}: label {CONCLUSION[g.label] ?? g.label} · model {CONCLUSION[g.modelConclusion] ?? g.modelConclusion}</li>)}</ul>
            {gold.runs[0] && <p className="mt-1 text-xs">Evaluasi terakhir: akurasi {formatPct(gold.runs[0].metrics.accuracy)} · Brier {gold.runs[0].metrics.brierScore.toFixed(3)} · {gold.runs[0].metrics.items} item</p>}
            {canRun && gold.items.length > 0 && <Button className="mt-2" size="xs" color="secondary" onClick={async () => { const r = await api(`/projects/${projectId}/gold-sets`, { body: {} }); setMsg(r.ok ? "Evaluasi selesai." : errorText(r.error)); load(); }}>Jalankan evaluasi</Button>}
            {msg && <p className="text-xs text-ink-2">{msg}</p>}
          </div>
        )}
      </div>
    </details>
  );
}

export function AssessmentPanel({ projectId, findingId, canRun, canCorrect }: { projectId: string; findingId: string; canRun: boolean; canCorrect: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Data>(`/projects/${projectId}/findings/${findingId}/assessments`).then((r) => (r.ok ? setData(r.data) : setError(errorText(r.error))));
  }, [projectId, findingId]);
  useEffect(load, [load]);
  const pending = data?.run && (data.run.status === "queued" || data.run.status === "running");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [pending, load]);

  if (error) return <p role="alert" className="text-sm text-error-primary">Penilaian gagal dimuat: {error}</p>;
  if (!data) return <p className="text-sm text-ink-3" role="status">Memuat penilaian…</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-ink-2">Jev menilai relevansi kandidat katalog berdasarkan paket bukti. Skor total dihitung kode dari bobot rubrik.</p>
        {canRun && <Button className="ml-auto" size="xs" color="secondary" isLoading={busy || !!pending} onClick={async () => {
          setBusy(true);
          const r = await api(`/projects/${projectId}/assessment-runs`, { body: { findingId } });
          setBusy(false);
          if (!r.ok) setError(errorText(r.error)); else load();
        }}>{data.assessments.length ? "Nilai ulang" : "Jalankan penilaian Jev"}</Button>}
      </div>
      {pending && <p role="status" className="text-sm text-ink-2">Penilaian berjalan: precondition, paket bukti, lalu Noul → Score → Choice…</p>}
      {data.run?.status === "failed" && <p role="alert" className="text-sm text-error-primary">Run penilaian gagal: {data.run.errorMessage}</p>}
      {!data.assessments.length && !pending && !data.blocked.length && <p className="text-sm text-ink-2">{data.run ? "Tidak ada kandidat katalog yang cocok dengan temuan ini, sehingga relevansi tidak dinilai." : "Belum ada penilaian."}</p>}
      <ul className="flex flex-col gap-2">
        {data.assessments.map((a) => (
          <li key={a.id} className="rounded-lg border border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium">{a.candidateAction}</span>
              <StatePill tone={STATUS[a.status]?.tone ?? "neutral"}>{STATUS[a.status]?.label ?? a.status}</StatePill>
              {a.adapter === "fixture" && <StatePill tone="warning">Mode fixture</StatePill>}
              {a.specSuperseded && <StatePill tone="neutral">Spesifikasi lama</StatePill>}
              {a.contextMaybeStale && <StatePill tone="warning">Bukti mungkin usang</StatePill>}
            </div>
            {a.status === "failed" ? <p className="mt-1 text-sm text-error-primary">{a.errorMessage}</p> : (
              <div className="mt-1 grid gap-x-6 gap-y-1 text-xs text-ink-2 sm:grid-cols-2">
                <p><span className="text-ink-3">Hasil model:</span> {a.conclusion ? CONCLUSION[a.conclusion] : "–"} {a.topProbability != null && `(p ${a.topProbability.toFixed(2)}, margin ${a.margin?.toFixed(2)})`}</p>
                <p><span className="text-ink-3">Nilai efektif:</span> <span className="font-medium text-ink">{a.effective.conclusion ? CONCLUSION[a.effective.conclusion] : "–"}</span> · {a.effective.source === "model" ? "dari model, belum ditinjau" : a.effective.source === "confirmation" ? "dikonfirmasi analis" : "dikoreksi analis"}</p>
                <p><span className="text-ink-3">Skor rubrik:</span> {a.totalScore != null ? a.totalScore.toFixed(2) : a.missingCriteria.length ? `tidak dihitung (kurang: ${a.missingCriteria.join(", ")})` : "–"} · kecukupan bukti p {a.sufficiencyProbability?.toFixed(2) ?? "–"}</p>
                <p><span className="text-ink-3">Model:</span> {a.model ?? "–"} {a.modelVersion} · spesifikasi {a.questionSpecs.map((s) => `${s.task}@${s.version}`).join(", ")} · rubrik v{a.rubricVersion ?? "–"}</p>
                {a.criteria.length > 0 && <p className="sm:col-span-2"><span className="text-ink-3">Kriteria:</span> {a.criteria.map((c) => `${c.key} ${c.score ?? "?"} (bobot ${c.weight}, p ${c.probability?.toFixed(2) ?? "–"})`).join(" · ")}</p>}
                {a.corrections.map((c) => <p key={c.id} className="sm:col-span-2"><span className="text-ink-3">{c.kind === "confirm" ? "Konfirmasi" : "Koreksi"} oleh {c.by}:</span> {c.reason}</p>)}
              </div>
            )}
            {canCorrect && a.status === "needs_review" && !a.corrections.length && <div className="mt-2"><Review projectId={projectId} a={a} onDone={load} /></div>}
          </li>
        ))}
      </ul>
      {data.blocked.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-2">Kandidat tidak dinilai karena syarat ({data.blocked.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">{data.blocked.map((b) => (
            <li key={b.id} className="text-xs"><span className="font-medium">{b.candidateAction}</span> · {b.preconditionStatus === "not_eligible" ? "tidak memenuhi syarat" : "informasi tidak cukup"}: {b.checks.filter((c) => c.status !== "pass").map((c) => c.reason).join("; ")}</li>
          ))}</ul>
        </details>
      )}
      <Advanced projectId={projectId} canRun={canRun} />
    </div>
  );
}
