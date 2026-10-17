"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/nora/card";
import { Pill } from "@/components/nora/badges";
import { AssessmentStatusBadge } from "@/components/project/assessment-status";
import { ProbabilityBars } from "@/components/project/probability-bars";
import { formatDateTime, formatPercent, formatScore } from "@/lib/format";
import { RELEVANCE_LABEL, RELEVANCE_ORDER, THRESHOLDS, effective, hasModelVerdict, hasRelevanceResult, topTwo, totalScore } from "@/lib/mock/assessment";
import type { Assessment, AssessmentCorrection, Candidate } from "@/lib/mock/types";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h4 className="text-sm font-semibold text-ink">{title}</h4>
    {children}
  </section>
);

const Disabled = ({ children, note }: { children: React.ReactNode; note: string }) => (
  <span aria-disabled="true" title={note} className="cursor-not-allowed text-ink-3">{children} <span className="text-xs">(tersedia setelah M07)</span></span>
);

const STOPPED: Partial<Record<Assessment["status"], string>> = { gagal: "Penilaian gagal; belum ada hasil model", tertunda: "Penilaian tertunda; belum ada hasil model" };

/**
 * Side panel for one scored candidate. `corrections` are all corrections of the project (the latest for this result wins).
 * `canAct` = may correct/confirm (permission and active project); `onConfirm` is only offered when nothing was corrected yet.
 */
export function CandidatePanel({ assessment: a, candidate, corrections, actorName, canAct, onClose, onCorrect, onConfirm }: {
  assessment: Assessment; candidate: Candidate; corrections: AssessmentCorrection[]; actorName: (id: string) => string; canAct: boolean;
  onClose: () => void; onCorrect: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, [a.id]);

  const eff = effective(a, corrections);
  const { top, second, margin } = topTwo(a.relevance.probs);
  const total = totalScore(a.scores, candidate.criteria);
  const history = corrections.filter((c) => c.assessmentId === a.id);
  const canConfirm = canAct && (a.status === "otomatis" || a.status === "perlu_review") && !eff.correction;
  const cor = eff.correction;
  const verdict = hasModelVerdict(a);

  return (
    <aside ref={ref} tabIndex={-1} aria-label={`Detail kandidat ${candidate.name}`}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col overflow-y-auto border-l border-line bg-white shadow-xl outline-none">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 title={candidate.name} className="truncate text-base font-semibold text-ink">{candidate.name}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <AssessmentStatusBadge status={a.status} />
            <span className="text-sm text-ink-3">{candidate.kind === "hipotesis" ? "Hipotesis" : "Intervensi"}</span>
            {verdict && eff.source === "model" && <Pill className="text-ink-2">Dinilai model</Pill>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup panel" className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink">
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="flex flex-col gap-6 px-5 py-5">
        {!verdict && (
          <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">{STOPPED[a.status]}</p>
        )}

        {verdict && <Section title="1. Bukti cukup?">
          <ProbabilityBars items={[{ key: "cukup", label: "Peluang bukti cukup", p: a.sufficient.prob }]} highlight={a.sufficient.prob >= THRESHOLDS.sufficient ? ["cukup"] : []} />
          <p className="text-sm text-ink-2">
            Ambang {formatScore(THRESHOLDS.sufficient)}: {a.sufficient.prob >= THRESHOLDS.sufficient ? "bukti cukup untuk dinilai" : "bukti belum cukup, penilaian dihentikan"}
          </p>
        </Section>}

        {verdict && <Section title="2. Skor per kriteria">
          {a.scores.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">
              Dihentikan: bukti belum cukup
            </p>
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-ink-3"><th className="pb-1 font-medium">Kriteria</th><th className="pb-1 font-medium">Bobot</th><th className="pb-1 font-medium">Tingkat terpilih</th></tr>
                </thead>
                {a.scores.map((sc) => {
                  const c = candidate.criteria.find((x) => x.key === sc.key);
                  const def = c?.scale.find((s) => s.level === sc.level)?.definition;
                  return (
                    <tbody key={sc.key} className="border-t border-line align-top">
                      <tr>
                        <th scope="row" className="py-2 pr-2 font-medium text-ink"><span title={c?.label ?? sc.key} className="block max-w-[10rem] truncate">{c?.label ?? sc.key}</span></th>
                        <td className="py-2 pr-2 tabular-nums text-ink-2">{c ? formatPercent(c.weight) : "–"}</td>
                        <td className="py-2 text-ink-2"><span className="font-medium text-ink">Tingkat {sc.level}</span>{def && <span title={def} className="block max-w-[16rem] truncate">{def}</span>}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="pb-3">
                          <ProbabilityBars highlight={[String(sc.level)]} items={sc.probs.map((p, i) => ({ key: String(i + 1), label: `Tingkat ${i + 1}`, p }))} />
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </table>
              <div className="flex flex-col gap-0.5 border-t border-line pt-3">
                <p className="text-sm font-semibold text-ink">Skor total: {formatScore(total)}{total != null && " / 100"}</p>
                <p className="text-xs text-ink-3">Σ (tingkat−1)/4 × bobot, dihitung aplikasi</p>
              </div>
            </>
          )}
        </Section>}

        {verdict && !hasRelevanceResult(a) && (
          <Section title="3. Relevansi"><p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-ink-2">Tidak dijalankan: bukti belum cukup</p></Section>
        )}

        {hasRelevanceResult(a) && <Section title="3. Relevansi">
          <ProbabilityBars highlight={[top[0], second[0]]} items={RELEVANCE_ORDER.map((k) => ({ key: k, label: RELEVANCE_LABEL[k], p: a.relevance.probs[k] }))} />
          <p className="text-sm text-ink-2">
            Teratas: {RELEVANCE_LABEL[top[0]]}; kedua: {RELEVANCE_LABEL[second[0]]}. Selisih {formatPercent(margin)} (ambang {formatPercent(THRESHOLDS.margin)}), probabilitas teratas {formatPercent(top[1])} (ambang {formatPercent(THRESHOLDS.topProb)}).
          </p>
        </Section>}

        {(verdict || cor || canAct) && <Section title={verdict ? "Hasil model dan koreksi" : "Koreksi"}>
          <div className={cor && verdict ? "grid gap-3 sm:grid-cols-2" : undefined}>
            {verdict && (
              <Card className="flex flex-col gap-1 p-3">
                <p className="text-xs font-medium text-ink-3">Hasil model</p>
                <p className="text-sm text-ink">{RELEVANCE_LABEL[top[0]]}</p>
              </Card>
            )}
            {cor && (
              <Card className="flex flex-col gap-1 p-3">
                <p className="text-xs font-medium text-ink-3">{cor.confirmedOnly ? "Konfirmasi analis" : "Koreksi analis"}</p>
                <p className="text-sm text-ink">{RELEVANCE_LABEL[cor.relevance]}</p>
                <p className="text-xs text-ink-3">{actorName(cor.actorId)} · {formatDateTime(cor.at)}</p>
                {cor.reason && <p title={cor.reason} className="line-clamp-4 text-sm break-words text-ink-2">{cor.reason}</p>}
              </Card>
            )}
          </div>
          {(verdict || cor) && <p className="text-sm font-medium text-ink">Nilai efektif: {RELEVANCE_LABEL[eff.relevance]} (oleh {eff.source})</p>}
          {history.length > 1 && <p className="text-xs text-ink-3">{history.length - 1} koreksi sebelumnya tetap tercatat</p>}
          {canAct && (
            <div className="flex flex-wrap gap-2">
              <Button color="primary" size="xs" onClick={onCorrect}>Koreksi</Button>
              {canConfirm && <Button color="secondary" size="xs" onClick={onConfirm}>Konfirmasi hasil model</Button>}
            </div>
          )}
        </Section>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
          {([["Model", a.modelId], ["Spesifikasi", `v${a.specVersion}`], ["Run", a.runId], ["Paket bukti", a.evidenceBundleId], ["Waktu", formatDateTime(a.createdAt)]] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-ink-3">{k}</dt><dd title={v} className="truncate text-ink">{v}</dd></div>
          ))}
          <div className="col-span-2 flex gap-4">
            <Disabled note="Tersedia setelah M07">Paket bukti</Disabled>
            <Disabled note="Tautan tiruan pada data contoh">Keluaran mentah</Disabled>
          </div>
        </dl>
      </div>
    </aside>
  );
}
