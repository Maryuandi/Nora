"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { NoraModal } from "@/components/nora/modal";
import { formatMetric } from "@nora/contracts";
import { StatePill } from "../badges";
import { useTRPC } from "@/lib/trpc/client";
import { attempt, errorText, toApiError } from "../api";
import { AUDIENCE_LABEL, CHECK_LABEL, CLAIM_TYPE, INTERPRETATION_STATUS, SECTION_LABEL } from "./labels";

type Target = "finding" | "assessment" | "candidate_comparison";
interface Summary { id: string; audience: string; status: string; createdAt: string; stale: boolean; reusedFrom: string | null }
interface Citation { ref: string; itemType: string; itemId: string; itemVersion: string | null; contentRef: string | null }
interface Metric { ref: string; evidenceRef: string; metric: string; value: number; unit: string; metricKey: string; metricVersion: number }
interface Claim { ordinal: number; type: string; text: string; citations: Citation[]; metrics: Metric[]; candidateId: string | null }
interface Violation { check: string; message: string; claim?: string }
interface Detail extends Summary {
  targetType: Target; modelGenerated: boolean; attempts: { attempt: number; ok: boolean; model: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number | null; violations: Violation[] }[];
  sections: { key: string; claims: Claim[] }[]; assumptions: string[]; uncertainties: string[]; followUpQuestions: string[]; validated: { id: string; action: string }[];
  checkReport: { ok: boolean; attempts: number; checkerVersion: string; violations: Violation[] } | null; errorMessage: string | null;
  provider: string | null; model: string | null; modelVersion: string | null; templateVersion: number | null; checkerVersion: string | null; evidenceBundleId: string | null;
  inputTokens: number | null; outputTokens: number | null; cost: number | null; acceptedBy: string | null; acceptedAt: string | null; flaggedBy: string | null; flagReason: string | null;
  versions: { version: number; kind: string; createdBy: string | null; note: string | null }[];
}
const IN_FLIGHT = ["queued", "generating", "checking", "repairing"];

function CitationChip({ c }: { c: Citation }) {
  return (
    <Tooltip title={`${c.ref} · ${c.itemType}`} description={`${c.itemId}${c.itemVersion ? ` · versi ${c.itemVersion}` : ""}${c.contentRef ? ` · isi ${c.contentRef}` : ""}`}>
      <TooltipTrigger aria-label={`Sitasi ${c.ref}: ${c.itemType}`} className="rounded border border-line bg-canvas px-1.5 font-mono text-[11px] text-ink-2 hover:border-accent hover:text-accent">{c.ref}</TooltipTrigger>
    </Tooltip>
  );
}

function MetricChip({ m }: { m: Metric }) {
  return (
    <Tooltip title={`${m.metric} = ${formatMetric(m)}`} description={`Nilai tepat ${m.value} (${m.unit}) · ${m.metricKey}${m.metricVersion ? ` v${m.metricVersion}` : ""} · dari ${m.evidenceRef}; diisi kode, bukan model`}>
      <TooltipTrigger aria-label={`Metrik ${m.metric}`} className="rounded border border-dashed border-accent/50 px-1.5 text-[11px] text-accent">{m.ref} · {m.metric}</TooltipTrigger>
    </Tooltip>
  );
}

function Draft({ d }: { d: Detail }) {
  return (
    <div className="flex flex-col gap-3">
      {d.sections.map((s) => (
        <section key={s.key} aria-label={SECTION_LABEL[s.key] ?? s.key}>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">{SECTION_LABEL[s.key] ?? s.key}</h4>
          {s.claims.length === 0 ? (
            <p className="text-sm text-ink-3">{s.key === "validated_recommendations" ? "Belum ada kandidat tervalidasi; bagian ini sengaja kosong." : "Tidak ada klaim."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {s.claims.map((c) => (
                <li key={c.ordinal} className="rounded-md border border-line px-3 py-2">
                  <p className="text-sm">{c.text}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatePill tone={CLAIM_TYPE[c.type]?.tone ?? "neutral"}>{CLAIM_TYPE[c.type]?.label ?? c.type}</StatePill>
                    {c.citations.map((x) => <CitationChip key={x.ref} c={x} />)}
                    {c.metrics.map((m) => <MetricChip key={m.ref} m={m} />)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {([["Asumsi", d.assumptions], ["Ketidakpastian", d.uncertainties], ["Pertanyaan lanjutan", d.followUpQuestions]] as const).map(([label, list]) => (
        <section key={label} aria-label={label}>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</h4>
          {list.length ? <ul className="list-disc pl-5 text-sm text-ink-2">{list.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-sm text-ink-3">–</p>}
        </section>
      ))}
    </div>
  );
}

function Violations({ list }: { list: Violation[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {list.slice(0, 20).map((v, n) => (
        <li key={n} className="rounded-md border border-status-ended/30 px-3 py-1.5">
          <span className="font-medium">{CHECK_LABEL[v.check] ?? v.check}:</span> {v.message}{v.claim && <span className="block text-xs text-ink-3">“{v.claim}”</span>}
        </li>
      ))}
    </ul>
  );
}

export function InterpretationPanel({ projectId, targetType, targetId, canRequest, canReview }: { projectId: string; targetType: Target; targetId: string; canRequest: boolean; canReview: boolean }) {
  const [picked, setSelected] = useState<string | null>(null);
  const [audience, setAudience] = useState("analyst");
  const [actionError, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"accept" | "flag" | null>(null);
  const [text, setText] = useState("");

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const historyQ = useQuery(trpc.interpretations.list.queryOptions({ projectId, targetId }));
  const history: Summary[] | null = historyQ.data?.interpretations ?? null;
  const selected = picked ?? history?.[0]?.id ?? null;
  // Polls while the selected draft is being generated or checked.
  const detailQ = useQuery({
    ...trpc.interpretations.get.queryOptions(selected ? { projectId, interpretationId: selected } : skipToken),
    refetchInterval: (q) => (q.state.data && IN_FLIGHT.includes(q.state.data.status) ? 2000 : false),
  });
  const detail: Detail | undefined = detailQ.data;
  const pending = !!detail && IN_FLIGHT.includes(detail.status);
  const queryError = historyQ.error ?? detailQ.error;
  const error = actionError ?? (queryError ? errorText(toApiError(queryError)) : null);
  // The history list shows each draft's status; refresh it whenever the selected one moves on.
  const detailStatus = detail?.status;
  useEffect(() => {
    if (detailStatus) queryClient.invalidateQueries({ queryKey: trpc.interpretations.list.queryKey({ projectId, targetId }) });
  }, [detailStatus, queryClient, trpc, projectId, targetId]);

  const requestDraft = useMutation(trpc.interpretations.request.mutationOptions());
  const regenerate = useMutation(trpc.interpretations.regenerate.mutationOptions());
  const accept = useMutation(trpc.interpretations.accept.mutationOptions());
  const flag = useMutation(trpc.interpretations.flag.mutationOptions());

  async function act(call: () => Promise<{ id: string }>) {
    setBusy(true);
    setError(null);
    const r = await attempt(call());
    setBusy(false);
    if (!r.ok) return setError(r.error.details?.reason ?? errorText(r.error));
    setModal(null);
    setText("");
    setSelected(r.data.id);
    await queryClient.invalidateQueries({ queryKey: trpc.interpretations.pathKey() });
  }

  if (!history) return <p role="status" className="text-sm text-ink-3">Memuat interpretasi…</p>;
  const st = detail ? INTERPRETATION_STATUS[detail.status] : null;
  const usable = detail && ["passed", "accepted", "flagged"].includes(detail.status);
  return (
    <div className="flex flex-col gap-3">
      {canRequest && (
          <div className="flex items-end justify-end gap-2">
            <NativeSelect label="Pembaca" size="sm" value={audience} onChange={(e) => setAudience(e.target.value)} options={Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label }))} />
            <Button size="sm" color="secondary" isLoading={busy} onClick={() => act(() => requestDraft.mutateAsync({ projectId, request: { targetType, targetId, audience } }))}>Buat draft</Button>
          </div>
        )}
      {error && <p role="alert" className="text-sm text-error-primary">{error}</p>}
      {history.length === 0 && <p className="text-sm text-ink-3">Belum ada interpretasi untuk target ini.</p>}
      {history.length > 1 && (
        <NativeSelect label="Riwayat draft" size="sm" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}
          options={history.map((h) => ({ value: h.id, label: `${new Date(h.createdAt).toLocaleString("id-ID")} · ${AUDIENCE_LABEL[h.audience]} · ${INTERPRETATION_STATUS[h.status]?.label ?? h.status}${h.stale ? " · usang" : ""}` }))} />
      )}
      {detail && st && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatePill tone={st.tone}>{st.label}</StatePill>
            <StatePill tone="neutral">Untuk {AUDIENCE_LABEL[detail.audience]}</StatePill>
            {detail.modelGenerated && usable && <StatePill tone="warning" title="Disusun model; belum diterima analis">Dibuat model</StatePill>}
            {detail.stale && <StatePill tone="warning" title="Data, konteks, atau validasi target sudah berubah">Usang</StatePill>}
            {detail.reusedFrom && <StatePill tone="info" title="Bundle, template, model dan checker sama dengan draft sebelumnya">Dipakai ulang</StatePill>}
            <span className="text-xs text-ink-3">
              {detail.provider ?? "–"} · {detail.modelVersion ?? detail.model ?? "–"} · template v{detail.templateVersion ?? "–"} · {detail.checkerVersion ?? "–"} · {detail.attempts.length} percobaan
              {detail.inputTokens != null && ` · ${detail.inputTokens.toLocaleString("id-ID")}/${(detail.outputTokens ?? 0).toLocaleString("id-ID")} token`}
              {detail.cost != null && ` · US$${detail.cost.toFixed(4)}`}
            </span>
            {canReview && (
              <div className="ml-auto flex gap-2">
                {detail.status === "passed" && <Button size="xs" color="primary" onClick={() => setModal("accept")}>Terima sebagai ringkasan</Button>}
                {!IN_FLIGHT.includes(detail.status) && canRequest && <Button size="xs" color="secondary" isLoading={busy} onClick={() => act(() => regenerate.mutateAsync({ projectId, interpretationId: detail.id }))}>Buat ulang</Button>}
                {(detail.status === "passed" || detail.status === "accepted") && <Button size="xs" color="secondary" onClick={() => setModal("flag")}>Tandai masalah</Button>}
              </div>
            )}
          </div>
          {pending && <p role="status" className="text-sm text-ink-2">Menyusun paket bukti, memanggil model, lalu memeriksa skema, placeholder, sitasi, dan bahasa…</p>}
          {detail.status === "failed" && <p role="alert" className="text-sm text-error-primary">Interpretasi gagal: {detail.errorMessage}. Tidak ada draft lokal yang dibuat.</p>}
          {detail.status === "failed_check" && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-error-primary">Draft gagal pemeriksaan setelah {detail.checkReport?.attempts ?? detail.attempts.length} percobaan dan tidak ditampilkan. Ringkasan pelanggaran:</p>
              <Violations list={detail.checkReport?.violations ?? []} />
            </div>
          )}
          {detail.status === "accepted" && <p className="text-xs text-ink-3">Diterima oleh {detail.acceptedBy} · draft asli model dan laporan pemeriksaan tetap tersimpan{detail.versions.find((v) => v.kind === "accepted_summary")?.note ? ` · catatan: ${detail.versions.find((v) => v.kind === "accepted_summary")!.note}` : ""}.</p>}
          {detail.status === "flagged" && <p className="text-xs text-status-suspended">Ditandai oleh {detail.flaggedBy}: {detail.flagReason}</p>}
          {usable && <Draft d={detail} />}
          {detail.attempts.length > 0 && (
            <details className="text-xs text-ink-2">
              <summary className="cursor-pointer">Percobaan &amp; pemeriksaan</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {detail.attempts.map((a) => (
                  <li key={a.attempt}>Percobaan {a.attempt}: {a.ok ? "lolos" : `${a.violations?.length ?? 0} pelanggaran (${[...new Set((a.violations ?? []).map((v) => CHECK_LABEL[v.check] ?? v.check))].join(", ")})`} · {a.model} · {a.inputTokens ?? "–"}/{a.outputTokens ?? "–"} token · {a.latencyMs ?? "–"} ms</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <NoraModal open={modal !== null} onClose={() => setModal(null)} title={modal === "accept" ? "Terima sebagai ringkasan analisis" : "Tandai masalah"}
        description={modal === "accept" ? "Draft model asli dan laporan pemeriksaan tetap tersimpan; penerimaan dicatat sebagai versi baru." : "Jelaskan apa yang salah. Draft tidak dihapus."}
        footer={<><Button size="xs" color="secondary" onClick={() => setModal(null)}>Batal</Button>
          <Button size="xs" color="primary" isLoading={busy} isDisabled={modal === "flag" && text.trim().length < 3}
            onClick={() => detail && act(() => modal === "accept" ? accept.mutateAsync({ projectId, interpretationId: detail.id, note: text }) : flag.mutateAsync({ projectId, interpretationId: detail.id, reason: text }))}>Simpan</Button></>}>
        <TextArea label={modal === "accept" ? "Catatan (opsional)" : "Alasan"} rows={3} value={text} onChange={setText} isRequired={modal === "flag"} />
      </NoraModal>
    </div>
  );
}
