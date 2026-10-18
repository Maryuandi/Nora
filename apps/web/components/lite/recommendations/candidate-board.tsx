"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { cx } from "@/utils/cx";
import { StatePill } from "../badges";
import { RELEVANCE_LABEL, VALIDATION } from "./labels";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText } from "../api";
import { AutoRefresh } from "../auto-refresh";

const CHECK_LABEL: Record<string, string> = {
  applicability: "Syarat penerapan", referenced_metrics: "Metrik rujukan", source_versions: "Versi sumber", capability: "Kapabilitas data",
  owner_authority: "Pemilik", jev_assessment: "Penilaian Jev", evidence_freshness: "Kesegaran bukti",
};
const COMPONENT_LABEL: Record<string, string> = { relevance: "Relevansi", problemMagnitude: "Besaran masalah", evidenceConfidence: "Keyakinan bukti", effort: "Effort", risk: "Risiko" };

export interface CandidateRow {
  id: string; candidateType: string; candidateKey: string; candidateVersion: number; origin: string; action: string | null; status: string | null; stale: boolean | null;
  score: number | null; rank: number | null; partial: boolean | null; missing: string[] | null; components: Record<string, { value: number | null; source: string | null }> | null;
  policyVersion: number | null; checks: { key: string; status: string; failureStatus: string | null; reason: string }[]; conclusion: string | null; correctedConclusion: string | null; totalScore: number | null;
  evidenceBundleId: string | null; assessmentId: string | null; validatedAt: string | null;
}

export function CandidateBoard({ projectId, findingId, candidates, set, catalogSize, canWrite }: {
  projectId: string; findingId: string; candidates: CandidateRow[]; set: { status: string; errorMessage: string | null } | null; catalogSize: number; canWrite: boolean;
}) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = set?.status === "queued" || set?.status === "validating";
  const shown = all ? candidates : candidates.filter((c) => c.status === "validated" || c.status === "needs_review");
  const refreshMutation = useMutation(useTRPC().recommendations.refresh.mutationOptions());
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  async function refresh() {
    setBusy(true);
    const r = await attempt(refreshMutation.mutateAsync({ projectId, findingId }));
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <AutoRefresh active={!!running} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Filter status" className="flex rounded-lg border border-line p-0.5">
          {[[false, "Tervalidasi & perlu review"], [true, `Semua (${candidates.length})`]].map(([v, l]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={all === v} onClick={() => setAll(v as boolean)} className={cx("rounded-md px-3 py-1 text-xs font-medium", all === v ? "bg-accent text-white" : "text-ink-2")}>{l as string}</button>
          ))}
        </div>
        {running && <StatePill tone="info">Menyusun dan memvalidasi kandidat…</StatePill>}
        {set?.status === "failed" && <StatePill tone="error" title={set.errorMessage ?? ""}>Validasi gagal</StatePill>}
        {candidates.some((c) => c.stale) && <StatePill tone="warning">Data/konteks berubah — validasi usang</StatePill>}
        <div className="ml-auto flex gap-2">
          {canWrite && <Button size="xs" color="secondary" isLoading={busy || running} onClick={refresh}>{candidates.length ? "Validasi ulang" : "Susun kandidat"}</Button>}
          <Button size="xs" color="primary" isDisabled={sel.length < 2} onClick={() => router.push(`/lite/projects/${projectId}/recommendations/${findingId}/compare?ids=${sel.join(",")}`)}>Bandingkan ({sel.length})</Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      {catalogSize === 0 && !candidates.length && (
        <p className="text-sm text-ink-2">Katalog intervensi pada paket konteks kosong, sehingga tidak ada kandidat yang dibuat. <a className="text-accent hover:underline" href={`/lite/projects/${projectId}/prepare/context`}>Impor atau buat katalog</a>.</p>
      )}
      {catalogSize > 0 && !candidates.length && !running && <p className="text-sm text-ink-2">Belum ada kandidat. {canWrite ? "Susun kandidat untuk memilih intervensi katalog yang cocok dengan temuan." : ""}</p>}
      {candidates.length > 0 && shown.length === 0 && <p className="text-sm text-ink-2">Tidak ada kandidat tervalidasi atau perlu review. Lihat semua untuk alasan per kandidat.</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-sidebar text-xs text-ink-3"><tr>
              <th className="w-8 px-3 py-2"><span className="sr-only">Pilih</span></th><th className="px-3 py-2 font-medium">Peringkat</th><th className="px-3 py-2 font-medium">Kandidat</th>
              <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Skor prioritas</th><th className="px-3 py-2 font-medium">Relevansi Jev</th><th className="px-3 py-2 font-medium" />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((c) => (
                <Fragment key={c.id}>
                  <tr className={cx(sel.includes(c.id) && "bg-accent-soft")}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`Pilih ${c.action}`} checked={sel.includes(c.id)} disabled={!c.status || (!sel.includes(c.id) && sel.length >= 4)} onChange={() => toggle(c.id)} /></td>
                    <td className="px-3 py-2 text-ink-2">{c.rank ?? "–"}</td>
                    <td className="px-3 py-2"><p className="font-medium">{c.action}</p><p className="text-xs text-ink-3">{c.candidateType === "analyst" ? c.origin : `katalog ${c.candidateKey} v${c.candidateVersion}`}</p></td>
                    <td className="px-3 py-2">{c.status ? <StatePill tone={VALIDATION[c.status]?.tone ?? "neutral"}>{VALIDATION[c.status]?.label ?? c.status}</StatePill> : <span className="text-ink-3">belum divalidasi</span>}{c.stale && <span className="ml-1"><StatePill tone="warning">usang</StatePill></span>}</td>
                    <td className="px-3 py-2">{c.score != null ? c.score.toFixed(3) : "–"}{c.partial && <span className="ml-1 text-xs text-status-suspended" title={`Komponen hilang: ${c.missing?.join(", ")}`}>parsial</span>}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{RELEVANCE_LABEL[c.correctedConclusion ?? c.conclusion ?? ""] ?? "–"}{c.totalScore != null && ` · rubrik ${c.totalScore.toFixed(2)}`}</td>
                    <td className="px-3 py-2"><button type="button" className="text-xs text-accent hover:underline" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>Cek & sumber</button></td>
                  </tr>
                  {open === c.id && (
                    <tr><td colSpan={7} className="bg-canvas px-5 py-3">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <ul className="flex flex-col gap-1 text-xs">
                          {c.checks.map((k) => (
                            <li key={k.key} className="flex gap-2"><StatePill tone={k.status === "pass" ? "active" : k.status === "fail" ? "error" : "neutral"}>{k.status === "pass" ? "Lolos" : k.status === "fail" ? "Gagal" : "Tak terevaluasi"}</StatePill><span><span className="font-medium">{CHECK_LABEL[k.key] ?? k.key}</span> · {k.reason}</span></li>
                          ))}
                        </ul>
                        <div className="text-xs">
                          <p className="mb-1 font-medium">Komponen skor (kebijakan v{c.policyVersion ?? 0})</p>
                          <ul className="flex flex-col gap-0.5">{Object.entries(c.components ?? {}).map(([k, v]) => (
                            <li key={k}>{COMPONENT_LABEL[k] ?? k}: {v.value == null ? <span className="text-status-suspended">tidak tersedia</span> : v.value.toFixed(3)} <span className="text-ink-3">{v.source ? `· ${v.source}` : ""}</span></li>
                          ))}</ul>
                          {c.missing && c.missing.length > 0 && <p className="mt-1 text-status-suspended">Skor parsial: {c.missing.map((m) => COMPONENT_LABEL[m] ?? m).join(", ")} dikeluarkan dari pembilang dan penyebut.</p>}
                          {c.evidenceBundleId && <p className="mt-1 text-ink-3">Paket bukti {c.evidenceBundleId.slice(0, 8)} · penilaian {c.assessmentId?.slice(0, 8)}</p>}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-3">Skor prioritas adalah alat bantu pengurutan, bukan keputusan. Besaran masalah berasal dari metrik temuan, bukan prediksi penghematan.</p>
    </div>
  );
}

export function AnalystCandidateForm({ projectId, findingId }: { projectId: string; findingId: string }) {
  const router = useRouter();
  const [f, setF] = useState({ description: "", addressedProblem: "", successMetric: "", sourceReason: "", ownerRole: "", effort: "", risk: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const addCandidate = useMutation(useTRPC().recommendations.addCandidate.mutationOptions());
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const scale = [{ value: "", label: "Tidak diketahui" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))];
  return (
    <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold">Tambah kandidat Analis</summary>
      <div className="mt-3 flex flex-col gap-3">
        <TextArea label="Deskripsi tindakan" rows={2} value={f.description} onChange={set("description")} isRequired isInvalid={!!errors.description} hint={errors.description} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Masalah yang ditangani" value={f.addressedProblem} onChange={set("addressedProblem")} isRequired isInvalid={!!errors.addressedProblem} hint={errors.addressedProblem} />
          <Input label="Metrik keberhasilan" value={f.successMetric} onChange={set("successMetric")} isRequired isInvalid={!!errors.successMetric} hint={errors.successMetric} />
          <Input label="Sumber atau alasan" value={f.sourceReason} onChange={set("sourceReason")} isRequired isInvalid={!!errors.sourceReason} hint={errors.sourceReason} />
          <Input label="Peran pemilik" value={f.ownerRole} onChange={set("ownerRole")} />
          <NativeSelect label="Effort (1–5)" size="sm" value={f.effort} onChange={(e) => set("effort")(e.target.value)} options={scale} />
          <NativeSelect label="Risiko (1–5)" size="sm" value={f.risk} onChange={(e) => set("risk")(e.target.value)} options={scale} />
        </div>
        <div className="flex items-center justify-end gap-2">
          {msg && <p role="status" className="mr-auto text-sm text-ink-2">{msg}</p>}
          <Button size="xs" color="primary" onClick={async () => {
            const r = await attempt(addCandidate.mutateAsync({ projectId, candidate: { ...f, findingId, effort: f.effort ? Number(f.effort) : null, risk: f.risk ? Number(f.risk) : null } }));
            if (!r.ok) { setErrors(r.error.details ?? {}); setMsg(r.error.details ? null : errorText(r.error)); return; }
            setErrors({});
            setMsg("Kandidat tersimpan. Jalankan validasi ulang untuk menilainya.");
            setF({ description: "", addressedProblem: "", successMetric: "", sourceReason: "", ownerRole: "", effort: "", risk: "" });
            router.refresh();
          }}>Simpan kandidat</Button>
        </div>
      </div>
    </details>
  );
}

export function PolicyEditor({ projectId, weights, version, canWrite }: { projectId: string; weights: Record<string, number>; version: number; canWrite: boolean }) {
  const [w, setW] = useState(Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, String(v)])));
  const [msg, setMsg] = useState<string | null>(null);
  const savePolicy = useMutation(useTRPC().recommendations.savePolicy.mutationOptions());
  return (
    <details className="rounded-lg border border-line bg-white px-5 py-3 shadow-card">
      <summary className="cursor-pointer text-sm font-semibold">Advanced: kebijakan prioritas (v{version})</summary>
      <fieldset disabled={!canWrite} className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-ink-3">Relevansi, besaran, dan keyakinan berbobot positif; effort dan risiko negatif. Perubahan membuat versi baru; skor lama tetap tersimpan.</p>
        <div className="grid gap-3 md:grid-cols-5">
          {Object.keys(weights).map((k) => <Input key={k} label={COMPONENT_LABEL[k] ?? k} value={w[k]!} onChange={(v) => setW({ ...w, [k]: v })} />)}
        </div>
        <div className="flex items-center justify-end gap-2">
          {msg && <p role="status" className="mr-auto text-sm text-ink-2">{msg}</p>}
          {canWrite && <Button size="xs" color="secondary" onClick={async () => {
            const r = await attempt(savePolicy.mutateAsync({ projectId, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) }));
            setMsg(r.ok ? `Kebijakan v${r.data.version} tersimpan; validasi ulang untuk menghitung skor baru.` : errorText(r.error));
          }}>Simpan kebijakan</Button>}
        </div>
      </fieldset>
    </details>
  );
}

